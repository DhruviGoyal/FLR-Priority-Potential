
var featurePrep = require('users/mtpictd/anoushka:ecological_clustering/feature_prep');
var kmeans = require('users/mtpictd/anoushka:ecological_clustering/kmeans');
var snic = require('users/mtpictd/anoushka:ecological_clustering/snic');
var viz = require('users/mtpictd/anoushka:ecological_clustering/visualization');

// HELPERS

// Load an ImageCollection from a folder of images
function getImgCollection(folderPath) {
  var assetList = ee.data.getList({ id: folderPath });
  
  var imageList = assetList.map(function(asset) {
    return ee.Image(asset.id);
  });
  
  return ee.ImageCollection.fromImages(ee.List(imageList));
}

// Get no of tree/total pixels per cluster
function clusterTreeStats(clusteredImg, roi, scale) {
  // Tree mask
  var treeMask = getImgCollection('projects/ee-mtpictd/assets/anoushka/LTP_area_perim_2023')
                .mosaic().select('large_tree_patch');

  var clusters = clusteredImg.rename('cluster');

  // Total pixels per cluster
  var totalPx = clusters.reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: roi.geometry(),
    scale: scale,
    maxPixels: 1e13
  }).get('cluster');
  totalPx = ee.Dictionary(totalPx);

  // Tree pixels per cluster
  var treeClusters = clusters.updateMask(treeMask);
  var treePx = treeClusters.reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: roi.geometry(),
    scale: scale,
    maxPixels: 1e13
  }).get('cluster');
  treePx = ee.Dictionary(treePx);

  var features = totalPx.keys().map(function(k) {
    k = ee.String(k);
    return ee.Feature(null, {
      cluster: ee.Number.parse(k),
      total_pixels: ee.Number(totalPx.get(k)),
      tree_pixels: ee.Number(treePx.get(k, 0))
    });
  });

  return ee.FeatureCollection(features);
}


// TO RUN THIS SCRIPT, BUILD ROIS_FC AND DEFINE THE EXPERIMENTS
// FOR LARGE/MANY ROIS, BETTER TO DO ONE EXPERIMENT AT A TIME

// CONFIG

var aczList = [
'Eastern Plateau & Hills Region', // DONE
'Southern Plateau and Hills Region', // DONE
'East Coast Plains & Hills Region', // DONE
'Western Plateau and Hills Region', // DONE
'Central Plateau & Hills Region', // DONE
'West Coast Plains & Ghat Region', // DONE
'Lower Gangetic Plain Region', // DONE
'Middle Gangetic Plain Region', // DONE
'Eastern Himalayan Region', // DONE
'Western Himalayan Region', // DONE
'Upper Gangetic Plain Region', // DONE
'Trans Gangetic Plain Region', // DONE
'Gujarat Plains & Hills Region', // DONE
'Western Dry Region' // DONE
];
var aczAcronymDict = {
  'Eastern Plateau & Hills Region': 'EPAHR',
  'Southern Plateau and Hills Region': 'SPAHR',
  'East Coast Plains & Hills Region': 'ECPHR',
  'Western Plateau and Hills Region': 'WPAHR',
  'Central Plateau & Hills Region': 'CPAHR',
  'West Coast Plains & Ghat Region': 'WCPGR',
  'Lower Gangetic Plain Region': 'LGPR',
  'Middle Gangetic Plain Region': 'MGPR',
  'Upper Gangetic Plain Region': 'UGPR',
  'Trans Gangetic Plain Region': 'TGPR',
  'Eastern Himalayan Region': 'EHR',
  'Western Himalayan Region': 'WHR',
  'Gujarat Plains & Hills Region': 'GPHR',
  'Western Dry Region': 'WDR'
};

// BUILD ROIS_FC
// This is the collection of ROIs to be clustered on

// TO GENERATE K-MEANS CLUSTERS (SUBSUBECOREGION) FOR A SINGLE ACZ
var acz = 'Lower Gangetic Plain Region';
// Build SNIC superpixel ROIs
var snicFC = featurePrep.snicSuperpixelROIsFC(acz);

var soilFC = ee.FeatureCollection('projects/ee-mtpictd/assets/anoushka/simplified_soil_types');
// Intersect SNIC superpixels with FAO soil polygons
var ROIS_FC = featurePrep.snicToSoilRoisFC(snicFC, soilFC);



// // TO GENERATE SNIC CLUSTERS FOR ALL ACZS in 'aczs'
// var aczs = ee.List([
//   'Lower Gangetic Plain Region',
//   'Western Himalayan Region',
//   'Gujarat Plains & Hills Region',
// ]);

// var ROIS_FC = ee.FeatureCollection('projects/ee-mtpictd/assets/harsh/Agroclimatic_regions')
//               .filter(ee.Filter.inList('regionname', aczs));
// ROIS_FC = ROIS_FC.map(function(feature) {
//   var acz = feature.get('regionname');
//   return feature.set('roi_id', aczAcronymDict.get(acz));
// })

// All experiments to run
var EXPERIMENTS = {
  no_aspect: {
                  scale: 100,
                  features: [
                    'elevation',
                    'slope',
                    'distToWater',
                  ],
                  assets: {
                    elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
                    slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
                    aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
                    distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
                  },
                },

  // soil: {
  //           scale: 100,
          
  //           features: [
  //             'pH',
  //             'texture',
  //             'awc',
  //             'drainage'
  //           ],
          
  //           assets: {
  //             elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
  //             slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
  //             aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
  //             distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
  //             pH: 'projects/ee-plantationsitescores/assets/Raster-T_PH_H2O',
  //             texture: 'projects/ee-plantationsitescores/assets/Raster-T_TEXTURE',
  //             awc: 'projects/ee-plantationsitescores/assets/Raster-AWC_CLASS',
  //             drainage: 'projects/ee-plantationsitescores/assets/Raster-Drainage'
  //           },
  //           textureClasses: [1,2,3],
            
  //           oneHotPrefixes: ['texture']
  // }

  // snic_subecoregion: {
  //                 scale: 5000,
  //                 features: [
  //                   'rainfall',
  //                   'temperature',
  //                   'meanElevation',
  //                 ],
  //                 assets: {
  //                   rainfall: 'projects/ee-mtpictd/assets/anoushka/annual_rainfall_wet_months_2000_2023',
  //                   temperature: 'projects/ee-ictd-dhruvi/assets/anoushka/india_temp_2000_2023',
  //                   meanElevation: 'projects/ee-mtpictd/assets/anoushka/india_elevation_5km',
  //                 },
  //               },

};

// Where KMeans params were exported
var KMEANS_PARAM_BASE =
  'projects/ee-mtpictd/assets/anoushka/ecological_clustering/kmeans_params/';
var ROI_IDENTIFIER = aczAcronymDict[acz] + '_snic_SMU_';

// Where SNIC params were exported, if any
var SNIC_PARAM_BASE =
  'projects/ee-mtpictd/assets/anoushka/ecological_clustering/snic_params/';


// MAIN LOOP: Currently this is just visualizing clusters
// Can be easily modified to export images or do other computation


// Flags to turn on KMeans or SNIC clustering
// Ensure that the corresponding param FCs exist
var doKMeans = true;
var doSNIC = false;

Object.keys(EXPERIMENTS).forEach(function (expName) {
  var cfg = EXPERIMENTS[expName];
  print('Running experiment:', expName);

  // Build raw inputs ONCE per experiment
  var raw = featurePrep.buildInputImage(cfg);

  var roiUnion = ee.Feature(ROIS_FC.geometry());
  var inputsAll = featurePrep.prepareForClustering(raw, roiUnion, cfg.scale, cfg.featureWeights);
  // Add inputs to map once on union of ROIs
  viz.visualizeInputs(
    inputsAll,
    roiUnion,
    cfg.oneHotPrefixes,
    expName + ' inputs'
  );

  Map.addLayer(roiUnion, {}, 'SMU Boundaries');

  // This generates all kmeans clusters in ROIS_FC into a single image for export
  var kmeansAll = ROIS_FC.map(function (roi) {
    roi = ee.Feature(roi);
    var roiId = roi.get('roi_id');
  
    var paramFC = ee.FeatureCollection(
      KMEANS_PARAM_BASE + ROI_IDENTIFIER + expName
    );
  
    var params = ee.Feature(
      paramFC.filter(ee.Filter.eq('roi_id', roiId)).first()
    );
  
    var k = ee.Number(params.get('k'));
  
    var inputs = inputsAll.clip(roi.geometry());
  
    var clusters = kmeans.kMeansClusters(inputs, roi, cfg.scale, k);
  
    // Paint clusters into ROI
    return clusters.clip(roi.geometry());
  });
  kmeansAll = ee.ImageCollection(kmeansAll).mosaic();

  if (doKMeans) {
      kmeansAll = kmeansAll.updateMask(ee.Image.constant(1).clip(roiUnion.geometry()));
      Export.image.toAsset({
      image: kmeansAll,
      description: aczAcronymDict[acz]  + '_KMeans_AllROIs_' + expName,
      assetId: 'projects/ee-mtpictd/assets/anoushka/kmeans_clusters/' + aczAcronymDict[acz],
      region: roiUnion.geometry(),
      scale: cfg.scale,
      maxPixels: 1e13
    });
}

});
