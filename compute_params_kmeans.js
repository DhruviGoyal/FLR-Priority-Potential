
var featurePrep = require('users/mtpictd/anoushka:ecological_clustering/feature_prep');
var kmeans = require('users/mtpictd/anoushka:ecological_clustering/kmeans');
var snic = require('users/mtpictd/anoushka:ecological_clustering/snic');

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


/* -- EXANPLE EXP_CONFIG -- 

var EXP_CONFIG = {
  scale: 100,

  features: [
    // 'elevation',
    // 'slope',
    // 'aspect',
    // 'distToWater',
    'pH',
    'texture',
    'awc',
    'drainage'
  ],

  assets: {
    elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
    slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
    aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
    distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
    pH: 'projects/ee-plantationsitescores/assets/Raster-T_PH_H2O',
    texture: 'projects/ee-plantationsitescores/assets/Raster-T_TEXTURE',
    awc: 'projects/ee-plantationsitescores/assets/Raster-AWC_CLASS',
    drainage: 'projects/ee-plantationsitescores/assets/Raster-Drainage'
  },

` // Options: trigonometric functions, binning into n classes
  aspectOptions: {
    bins: [2, 4, 6],
    includeTrig: false
  },

  // Feature weighting (optional)
  featureWeights: {
    elevation: 1.0,
    slope: 1.0,
    aspect: 0.5,
    distToWater: 1.2,
    pH: 0.8,
    texture: 0.3,
    awc: 0.3,
    drainage: 0.3
  }
};

*/

// Dictionary of all experiments (feature sets, weights etc)

var EXPERIMENTS = {
  // FOR K-MEANS CLUSTERING
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

  // // TRIAL SOIL CLUSTERING - NOT USED
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
  // }

  // // FOR SNIC CLUSTERING
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

// Where results will be exported
var KMEANS_PARAM_BASE =
  'projects/ee-mtpictd/assets/anoushka/ecological_clustering/kmeans_params/';
// Identifier for ROI set
var ROI_IDENTIFIER = aczAcronymDict[acz] + '_snic_SMU_';


// PARAMETER SEARCH

Object.keys(EXPERIMENTS).forEach(function (expName) {
  var cfg = EXPERIMENTS[expName];
  print('Building inputs for experiment:', expName);
  // Build raw inputs only once per experiment, then clip and normalize for each roi
  var raw = featurePrep.buildInputImage(cfg);

  var resultsFC = ROIS_FC.map(function (f) {
    var roi = ee.Feature(f);
    var roiName = f.get('roi_id');
    
    var inputs = featurePrep.prepareForClustering(raw, roi, cfg.scale, cfg.featureWeights);
    // Get optimal (elbow point) k
    var k = kmeans.elbowPointK(inputs, roi, cfg.scale, 3, 8, false);
  
    return ee.Feature(roi.geometry(), {
      roi_id: roiName,
      experiment: expName,
      k: k
    });
  });
  
  // Export collection of params for each experiment
  Export.table.toAsset({
    collection: resultsFC,
    description: aczAcronymDict[acz] + '_kmeans_params_' + expName,
    assetId: KMEANS_PARAM_BASE + ROI_IDENTIFIER + expName
  });

});
