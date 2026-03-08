
// NOTE: You must run compute_params_kmeans first!

var featurePrep = require('users/mtpictd/anoushka:ecological_clustering/feature_prep');
var snic = require('users/mtpictd/anoushka:ecological_clustering/snic');

// CONFIG

// Dictionary of all experiments - should be same as in compute_params_kmeans
var EXPERIMENTS = {
  // FOR SNIC CLUSTERING
  snic_subecoregion: {
                  scale: 5000,
                  features: [
                    'rainfall',
                    'temperature',
                    'meanElevation',
                  ],
                  assets: {
                    rainfall: 'projects/ee-mtpictd/assets/anoushka/annual_rainfall_wet_months_2000_2023',
                    temperature: 'projects/ee-ictd-dhruvi/assets/anoushka/india_temp_2000_2023',
                    meanElevation: 'projects/ee-mtpictd/assets/anoushka/india_elevation_5km',
                  },
                },
  
  // // FOR KMEANS CLUSTERING
  // no_aspect: {
  //                 scale: 100,
  //                 features: [
  //                   'elevation',
  //                   'slope',
  //                   'distToWater',
  //                 ],
  //                 assets: {
  //                   elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
  //                   slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
  //                   aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
  //                   distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
  //                 },
  //               },

  // // ABANDONED EXPERIMENTS
  
  // aspect_bins_4_wt_1: {
  //                 scale: 100,
  //                 features: [
  //                   'elevation',
  //                   'slope',
  //                   'aspect',
  //                   'distToWater',
  //                 ],
  //                 aspectOptions: {
  //                   bins: [4],
  //                   includeTrig: false
  //                 },
  //                 assets: {
  //                   elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
  //                   slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
  //                   aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
  //                   distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
  //                 },
  //               },
  // aspect_bins_6_wt_1: {
  //                 scale: 100,
  //                 features: [
  //                   'elevation',
  //                   'slope',
  //                   'aspect',
  //                   'distToWater',
  //                 ],
  //                 aspectOptions: {
  //                   bins: [6],
  //                   includeTrig: false
  //                 },
  //                 assets: {
  //                   elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
  //                   slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
  //                   aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
  //                   distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
  //                 },
  //               },

  // aspect_bins_4_wt_0_5: {
  //                 scale: 100,
  //                 features: [
  //                   'elevation',
  //                   'slope',
  //                   'aspect',
  //                   'distToWater',
  //                 ],
  //                 aspectOptions: {
  //                   bins: [4],
  //                   includeTrig: false
  //                 },
  //                 assets: {
  //                   elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
  //                   slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
  //                   aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
  //                   distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
  //                 },
  //                 featureWeights: {
  //                   aspect: 0.5,
  //                 }
  //               },
  // aspect_bins_4_wt_0_25: {
  //                 scale: 100,
  //                 features: [
  //                   'elevation',
  //                   'slope',
  //                   'aspect',
  //                   'distToWater',
  //                 ],
  //                 aspectOptions: {
  //                   bins: [4],
  //                   includeTrig: false
  //                 },
  //                 assets: {
  //                   elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
  //                   slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
  //                   aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
  //                   distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
  //                 },
  //                 featureWeights: {
  //                   aspect: 0.25,
  //                 }
  //               },
  // aspect_bins_4_wt_0_75: {
  //                 scale: 100,
  //                 features: [
  //                   'elevation',
  //                   'slope',
  //                   'aspect',
  //                   'distToWater',
  //                 ],
  //                 aspectOptions: {
  //                   bins: [4],
  //                   includeTrig: false
  //                 },
  //                 assets: {
  //                   elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
  //                   slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
  //                   aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
  //                   distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
  //                 },
  //                 featureWeights: {
  //                   aspect: 0.75,
  //                 }
  //               },

  // aspect_bins_6_wt_0_5: {
  //                 scale: 100,
  //                 features: [
  //                   'elevation',
  //                   'slope',
  //                   'aspect',
  //                   'distToWater',
  //                 ],
  //                 aspectOptions: {
  //                   bins: [6],
  //                   includeTrig: false
  //                 },
  //                 assets: {
  //                   elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
  //                   slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
  //                   aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
  //                   distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
  //                 },
  //                 featureWeights: {
  //                   aspect: 0.5,
  //                 }
  //               },
  // aspect_bins_6_wt_0_25: {
  //                 scale: 100,
  //                 features: [
  //                   'elevation',
  //                   'slope',
  //                   'aspect',
  //                   'distToWater',
  //                 ],
  //                 aspectOptions: {
  //                   bins: [6],
  //                   includeTrig: false
  //                 },
  //                 assets: {
  //                   elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
  //                   slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
  //                   aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
  //                   distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
  //                 },
  //                 featureWeights: {
  //                   aspect: 0.25,
  //                 }
  //               },
  // aspect_bins_6_wt_0_75: {
  //                 scale: 100,
  //                 features: [
  //                   'elevation',
  //                   'slope',
  //                   'aspect',
  //                   'distToWater',
  //                 ],
  //                 aspectOptions: {
  //                   bins: [6],
  //                   includeTrig: false
  //                 },
  //                 assets: {
  //                   elevation: 'projects/ee-ictd-dhruvi/assets/anoushka/india_elevation_30m',
  //                   slope: 'projects/ee-ictd-dhruvi/assets/anoushka/india_slope_30m',
  //                   aspect: 'projects/ee-ictd-dhruvi/assets/anoushka/india_aspect_30m',
  //                   distToWater: 'projects/ee-mtpictd/assets/anoushka/dist_water_2022',
  //                 },
  //                 featureWeights: {
  //                   aspect: 0.75,
  //                 }
  //               },

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

};

// Where K-means params were exported
var KMEANS_PARAM_BASE =
  'projects/ee-mtpictd/assets/anoushka/ecological_clustering/kmeans_params/';
var ROI_IDENTIFIER = 'ACZ_SNIC_subecoregions';

// Where SNIC params will be exported
var SNIC_PARAM_BASE =
  'projects/ee-mtpictd/assets/anoushka/ecological_clustering/snic_params/';



// SNIC SEARCH
// Due to computational constraints, SNIC params are exported separately for each ROI
Object.keys(EXPERIMENTS).forEach(function (expName) {

  print('SNIC spacing search for experiment:', expName);
  var cfg = EXPERIMENTS[expName];
  // Import K-Means params 
  var kParamFC = ee.FeatureCollection(
    KMEANS_PARAM_BASE + ROI_IDENTIFIER + expName
  );
  // Build raw feature set once per experiment
  var raw = featurePrep.buildInputImage(cfg);

  kParamFC.aggregate_array('roi_id').evaluate(function (roiNames) {
    roiNames.forEach(function (roiName) {
  
      var singleRoiFC = kParamFC.filter(ee.Filter.eq('roi_id', roiName));
  
      var results = singleRoiFC.map(function (f) {
        var roi = ee.Feature(f);
        var k = ee.Number(f.get('k'));
  
        var inputs = featurePrep.prepareForClustering(raw, roi, cfg.scale, cfg.featureWeights);
        var spacing = snic.snicSpacingSearch(inputs, roi, cfg.scale, k);
  
        return ee.Feature(roi.geometry(), {
          roi_id: roiName,
          experiment: expName,
          k: k,
          snic_spacing: spacing
        });
      });
      
      // Export separate table for each ROI
      Export.table.toAsset({
        collection: results,
        description: 'snic_params_' + roiName + '_' + expName,
        assetId: SNIC_PARAM_BASE + roiName + '_' + expName
      });
    });
  });
});

