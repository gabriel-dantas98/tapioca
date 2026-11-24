#include <math.h>
#include <stdint.h>
#include <stdlib.h>

void raster(int nv, int nt, const float *vertices, const int *tri, const uint8_t *colors,
            int w, int h, float yaw, float pitch, float scale, float center, uint8_t *pixels) {
    float *projected = malloc(nv * 3 * sizeof(float));
    float *depth = malloc(w * h * sizeof(float));
    float cy = cosf(yaw), sy = sinf(yaw), cp = cosf(pitch), sp = sinf(pitch);
    for (int i=0;i<w*h;i++) depth[i]=-1e12f;
    for (int i=0;i<nv;i++) {
        float x=vertices[i*3], y=vertices[i*3+1], z=vertices[i*3+2]-center;
        float forward=x*cy+y*sy;
        projected[i*3] = w*0.5f + scale*(-x*sy+y*cy);
        projected[i*3+1] = h*0.5f + scale*(forward*sp-z*cp);
        projected[i*3+2] = forward*cp+z*sp;
    }
    const uint8_t palettes[4][5][3]={
        {{99,55,21},{161,94,25},{217,146,39},{248,196,64},{255,234,127}},
        {{18,21,30},{28,34,46},{42,49,63},{59,68,82},{84,93,106}},
        {{49,55,64},{82,92,103},{120,132,143},{166,177,180},{214,221,215}},
        {{91,27,37},{145,37,45},{201,51,50},{241,82,62},{255,132,93}}
    };
    for(int t=0;t<nt;t++){
        int ia=tri[t*3]*3, ib=tri[t*3+1]*3, ic=tri[t*3+2]*3;
        const float *a=projected+ia, *b=projected+ib, *c=projected+ic;
        float bx=b[0]-a[0], by=b[1]-a[1], cx=c[0]-a[0], cy2=c[1]-a[1];
        float det=bx*cy2-by*cx;
        if (det>=-1e-8f) continue;
        int xmin=(int)ceilf(fminf(a[0], fminf(b[0],c[0]))-0.5f);
        int xmax=(int)floorf(fmaxf(a[0], fmaxf(b[0],c[0]))-0.5f);
        int ymin=(int)ceilf(fminf(a[1], fminf(b[1],c[1]))-0.5f);
        int ymax=(int)floorf(fmaxf(a[1], fmaxf(b[1],c[1]))-0.5f);
        if(xmin<0)xmin=0; if(ymin<0)ymin=0; if(xmax>=w)xmax=w-1; if(ymax>=h)ymax=h-1;
        if(xmin>xmax||ymin>ymax) continue;
        float bz=(b[2]-a[2])*scale, cz=(c[2]-a[2])*scale;
        float nx=cy2*bz-by*cz, ny=bx*cz-cx*bz, nz=-det;
        float len=sqrtf(nx*nx+ny*ny+nz*nz);
        float light=(0.45f*nx-0.64f*ny+0.62f*nz)/len;
        int shade=(int)((0.35f+0.64f*fmaxf(0,light))*5);
        if(shade>4)shade=4;
        const uint8_t *rgb=palettes[colors[t]][shade];
        for(int y=ymin;y<=ymax;y++) for(int x=xmin;x<=xmax;x++){
            float dx=x+0.5f-a[0], dy=y+0.5f-a[1];
            float u=(dx*cy2-dy*cx)/det, v=(bx*dy-by*dx)/det;
            if(u<0 || v<0 || u+v>1) continue;
            float z=a[2]+u*(b[2]-a[2])+v*(c[2]-a[2]);
            int i=y*w+x;
            if(z<=depth[i])continue;
            depth[i]=z;
            pixels[i*4]=rgb[0];pixels[i*4+1]=rgb[1];pixels[i*4+2]=rgb[2];pixels[i*4+3]=255;
        }
    }
    free(projected); free(depth);
}
