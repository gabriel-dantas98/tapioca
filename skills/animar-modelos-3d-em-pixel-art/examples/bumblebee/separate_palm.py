import os
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
source=np.load(os.path.join(os.environ['PIXEL_ART_OUTPUT'],'work','mesh.npz'))
v,f=source['vertices'],source['triangles']
eligible=(v[:,0]>9)&(v[:,2]<-14.5)
ids=np.flatnonzero(eligible)
indices=np.full(len(v),-1,dtype=np.int32)
indices[ids]=np.arange(len(ids))
e=f[:,[0,1,1,2,2,0]].reshape(-1,2)
e=e[eligible[e].all(axis=1)]
edges=indices[e]
G=coo_matrix((np.ones(len(edges),dtype=np.int8),edges.T),shape=(len(ids),len(ids))).tocsr()
_,labels=connected_components(G,directed=False)
seed=np.array([24,-4,-28])
hand_index=np.argmin(np.linalg.norm(v[ids]-seed,axis=1))
members=labels==labels[hand_index]
out=np.zeros(len(v),dtype=bool)
out[ids[members]]=True
arm=v[out]
print('palm and forearm:',len(arm),arm.min(0),arm.max(0))
assert 4000<len(arm)<90000
assert arm[:,2].min()>-31
np.save(os.path.join(os.environ['PIXEL_ART_OUTPUT'],'work','palm.npy'),out)
