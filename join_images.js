// Helper

function getImgCollection(folderPath, bandName) {
  var assetList = ee.data.getList({ id: folderPath });
  
  var imageList = assetList.map(function(asset) {
    return ee.Image(asset.id)
      .select(0)
      .rename(bandName)
      .toInt();
  });
  
  return ee.ImageCollection.fromImages(ee.List(imageList));
}


// Inputs 

var aczFC = ee.FeatureCollection(
  'projects/ee-mtpictd/assets/harsh/Agroclimatic_regions'
);

var soilFC = ee.FeatureCollection(
  'projects/ee-mtpictd/assets/anoushka/simplified_soil_types'
);

// SNIC images over ACZs
var snicRaster = getImgCollection(
  'projects/ee-mtpictd/assets/anoushka/snic_clusters',
  'snic_id'
).mosaic();

// KMeans images over ACZs
var kmeansRaster = getImgCollection(
  'projects/ee-mtpictd/assets/anoushka/kmeans_clusters',
  'kmeans_id'
).mosaic();



// Rasterize everything and reproject to appropriate scale

var scale = 100;
var snicScale = 5000;

var aczRaster = aczFC
  .reduceToImage({
    properties: ['regioncode'],
    reducer: ee.Reducer.first()
  })
  .rename('regioncode')
  .toInt()
  .reproject({ crs: 'EPSG:4326', scale: scale });

var soilRaster = soilFC
  .reduceToImage({
    properties: ['SNUM'],
    reducer: ee.Reducer.first()
  })
  .rename('SNUM')
  .toInt()
  .reproject({ crs: 'EPSG:4326', scale: scale });

var snicId = snicRaster.reproject({ crs: 'EPSG:4326', scale: snicScale });
var kmeansId = kmeansRaster.reproject({ crs: 'EPSG:4326', scale: scale });


// Final image

var indiaClusters = ee.Image.cat([
  aczRaster,
  snicId,
  soilRaster,
  kmeansId
]);

// Defined only where kmeansId is defined
indiaClusters = indiaClusters.updateMask(kmeansId.mask());

print('Final pan-India clustering image:', indiaClusters);

// Visualization 

var aczVis = {
  min: 1,
  max: 15,
  palette: [
    'e41a1c','377eb8','4daf4a','984ea3',
    'ff7f00','ffff33','a65628','f781bf',
    '999999','66c2a5','fc8d62','8da0cb'
  ]
};
var snicVis = {
  min: 0,
  max: 10,
  palette: ['440154','3b528b','21918c','5dc863','fde725']
};
var soilVis = {
  min: 3500,
  max: 7000,
  palette: ['8c510a','d8b365','f6e8c3','c7eae5','5ab4ac','01665e']
};
var kmeansVis = {
  min: 0,
  max: 10,
  palette: ['1b9e77','d95f02','7570b3','e7298a','66a61e']
};


Map.centerObject(aczFC, 5);

// Map.addLayer(aczRaster, aczVis, 'ACZ ID');
// Map.addLayer(snicId, snicVis, 'SNIC ID (5 km → 100 m)');
// Map.addLayer(soilRaster, soilVis, 'Soil ID');
// Map.addLayer(kmeansId, kmeansVis, 'K-Means ID');

var finalResult = ee.Image('projects/ee-mtpictd/assets/anoushka/india_multilevel_ecological_clusters_100m');

Map.addLayer(soilFC, {}, 'Soil FC');
Map.addLayer(finalResult.select('regioncode'), aczVis, 'ACZ ID');
Map.addLayer(finalResult.select('snic_id'), snicVis, 'SNIC ID (5 km → 100 m)');
Map.addLayer(finalResult.select('SNUM'), soilVis, 'Soil ID');
Map.addLayer(finalResult.select('kmeans_id'), kmeansVis, 'K-Means ID');

// // Export

// Export.image.toAsset({
//   image: indiaClusters,
//   description: 'India_Multilevel_Clusters_100m',
//   assetId: 'projects/ee-mtpictd/assets/anoushka/india_multilevel_ecological_clusters_100m',
//   region: aczFC.geometry(),
//   scale: scale,
//   maxPixels: 1e13
// });



