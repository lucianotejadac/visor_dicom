"""Compile and render the application's exact GLSL shaders in offscreen OpenGL.

Uses synthetic voxels only. This checks shader behavior, not the browser/WebGL API.
Install test dependencies: pip install --target .test-tools moderngl
"""
from pathlib import Path
import array
import re
import sys

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / '.test-tools'))
import moderngl

source = (root / 'app.js').read_text(encoding='utf-8')
vertex = re.search(r'const vertex=`(.*?)`;', source, re.S).group(1)
fragment = re.search(r'const fragment=`(.*?)`;', source, re.S).group(1)
ctx = moderngl.create_standalone_context(require=330)
program = ctx.program(vertex_shader=vertex, fragment_shader=fragment)
buffer = ctx.buffer(array.array('f', [-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]))
vao = ctx.simple_vertex_array(program, buffer, 'p')
framebuffer = ctx.simple_framebuffer((64,64), components=4)
framebuffer.use()
ctx.viewport = (0,0,64,64)
program['rotation'].write(array.array('f', [1,0,0,0,1,0,0,0,1]))
defaults = dict(extent=(2,2,2), aspect=1., zoom=1., ww=400., wl=40., threshold=120., opacity=.4,
                stepSize=.0625, mip=1, functional=1, grayPalette=0, rangeLow=5., rangeHigh=100., vox=0,
                fused=0,spectralVox=1,spectralScale=(.5,.5,.5),spectralShift=(.5,.5,.5),spectralOpacity=.65)
for key,value in defaults.items():
    program[key].value = value

def render(peak=100., spectral_peak=100., spectral_size=16, **uniforms):
    voxels = array.array('f', [0.] * 16**3)
    for z in range(4,12):
        for y in range(4,12):
            for x in range(4,12):
                voxels[x+16*(y+16*z)] = peak
    texture = ctx.texture3d((16,16,16), 1, voxels.tobytes(), dtype='f4')
    texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
    texture.repeat_x = texture.repeat_y = texture.repeat_z = False
    texture.use(0)
    n=spectral_size
    functional_data=array.array('f',[spectral_peak if n//4<=x<3*n//4 and n//4<=y<3*n//4 and n//4<=z<3*n//4 else 0. for z in range(n) for y in range(n) for x in range(n)])
    second=ctx.texture3d((n,n,n),1,functional_data.tobytes(),dtype='f4')
    second.filter=(moderngl.LINEAR,moderngl.LINEAR)
    second.repeat_x=second.repeat_y=second.repeat_z=False
    second.use(1)
    for key,value in defaults.items():
        program[key].value = value
    for key,value in uniforms.items():
        program[key].value = value
    framebuffer.clear()
    vao.render(moderngl.TRIANGLES)
    result = framebuffer.read(components=4)
    texture.release()
    second.release()
    return result

def center(pixels):
    start = 4*(32+64*32)
    return tuple(pixels[start:start+3])

checks = 0
def check(name, condition):
    global checks
    assert condition, name
    checks += 1
    print('PASS', name)

mip = render()
check('MIP finds maximum intensity along the ray', center(mip) == (255,255,255))
check('MIP color transfer uses selected range', center(render(rangeHigh=200.)) == (255,118,0))
gray = center(render(rangeHigh=200., grayPalette=1))
check('Grayscale MIP has equal channels', gray[0] == gray[1] == gray[2] and 115 <= gray[0] <= 125)
check('Below-threshold activity disappears in MIP', center(render(rangeLow=101., rangeHigh=200.)) == (0,0,0))
check('Functional MIP ignores CT window and CT threshold', render(ww=1.,wl=-1000.,threshold=1000.) == mip)
vrt = render(mip=0)
check('VRT accumulates visible activity', center(vrt)[0] > 150 and sum(center(vrt)) > 300)
check('VRT opacity controls accumulation', center(render(mip=0,opacity=.01))[0] < center(vrt)[0])
check('VRT threshold excludes activity', max(center(render(mip=0,rangeLow=101.,rangeHigh=200.))) < 20)
check('Bq/ml magnitude preserves normalized MIP appearance', render(peak=414890., rangeLow=20744.5, rangeHigh=414890.) == mip)
scaled_vrt = render(peak=414890., mip=0, rangeLow=20744.5, rangeHigh=414890.)
check('Bq/ml magnitude preserves VRT within rounding', max(abs(a-b) for a,b in zip(vrt,scaled_vrt)) <= 1)
check('Base MIP still uses grayscale window', center(render(functional=0,ww=201.,wl=100.5)) == (128,128,128))
fused_args=dict(fused=1,functional=0,ww=201.,wl=100.5,rangeHigh=200.)
blended=render(**fused_args)
rgb=center(blended)
check('Fused MIP contains gray CT plus colored SPECT', 200<rgb[0]<230 and 100<rgb[1]<140 and 30<rgb[2]<60)
check('Zero SPECT opacity restores CT MIP', center(render(**fused_args,spectralOpacity=0.))==(128,128,128))
check('Outside SPECT bounds stays CT-only without edge smearing', center(render(**fused_args,spectralShift=(2.,.5,.5)))==(128,128,128))
check('Different SPECT resolution retains physical center alignment', center(render(**fused_args,spectral_size=8))==rgb)
shifted=render(**fused_args,spectralShift=(.2,.5,.5))
def red_center(pixels):
    xs=[i%64 for i in range(64*64) if pixels[i*4]>pixels[i*4+1]+30]
    return sum(xs)/len(xs)
check('Physical translation moves the SPECT projection', red_center(shifted)>red_center(blended)+5)
fused_vrt=render(**fused_args,mip=0,threshold=0.)
no_activity=render(**fused_args,mip=0,threshold=0.,spectralOpacity=0.)
check('Fused VRT includes activity and CT contributions', center(fused_vrt)[0]>center(no_activity)[0] and center(fused_vrt)[2]<center(no_activity)[2])
check('Outside SPECT in VRT equals CT-only fusion', render(**fused_args,mip=0,threshold=0.,spectralShift=(2.,.5,.5))==no_activity)
check('Fused MIP honors independent Bq/ml scale', render(**{**fused_args,'rangeLow':20744.5,'rangeHigh':829780.},spectral_peak=414890.)==blended)
print(f'{checks} shader rendering checks passed. Offscreen OpenGL; no browser visual test.')
