var CanopyHealthChange = ee.ImageCollection("projects/ee-mtpictd/assets/dhruvi/overall_change_2017_2021");
var DEM = ee.FeatureCollection("USGS/SRTMGL1_003");


/*  ------- HELPER FUNCTIONS ------- */

function plotHistogram(image, bandName) {
  var histogram = image.reduceRegion({
    reducer: ee.Reducer.histogram(),
    geometry: image.geometry(),
    scale: 250, 
    maxPixels: 1e13
  });
  
  print(histogram);
  
  var histogramDict = ee.Dictionary(histogram.get(bandName));
  // print('Histogram:', imageHistogram);
  
  // Plot the histogram using ui.Chart
  var chart = ui.Chart.array.values({
    array: histogramDict.get('histogram'),
    axis: 0,
    xLabels: histogramDict.get('bucketMeans')
  }).setOptions({
    title: bandName,
    hAxis: {title: 'Values'},
    vAxis: {title: 'Frequency'},
    lineWidth: 0.3,
    pointSize: 0.3
  });
  
  // Display the chart
  print(chart);
}

function getImgCollection(folderPath) {
  var assetList = ee.data.getList({ id: folderPath });
  
  var imageList = assetList.map(function(asset) {
    return ee.Image(asset.id);
  });
  
  return ee.ImageCollection.fromImages(imageList);
}

function getDwTreeCover(aoi, startDate, endDate, scale) {

  var treeCoverDw = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
    .filterDate(startDate, endDate)
    .filterBounds(aoi)
    .select('label')
    .mode()
    .clip(aoi);

  return treeCoverDw
    .updateMask(treeCoverDw.eq(1))
    // .reproject({crs: 'EPSG:4326', scale: scale})
    .rename('tree_cover');
}

function getIsTreeCover(aoi, year, scale) {

  var indiasatAsset = 'projects/corestack-datasets/assets/datasets/LULC_v3_river_basin/pan_india_lulc_v3_' +
                      year.toString() + '_' + (year + 1).toString();
  
  var lulcImage = ee.Image(indiasatAsset)
    .select('predicted_label')
    .clip(aoi);

  return lulcImage
    .updateMask(lulcImage.eq(6))
    // .reproject({crs: 'EPSG:4326', scale: scale})
    .rename('tree_cover');
}

function getTreeCover(aoi, year, scale) {
  var startDate = ee.Date(ee.Number(year).format('%d').cat('-07-01'));
  var endDate = ee.Date(ee.Number(year+1).format('%d').cat('-06-30'));

  var treeCoverIs = getIsTreeCover(aoi, year, scale);
  var treeCoverDw = getDwTreeCover(aoi, startDate, endDate, scale);

  var treeCover = treeCoverIs.mask().or(treeCoverDw.mask());
  treeCover = treeCover.updateMask(treeCover);
  return treeCover;
  
  // return treeCover.reproject({crs: 'EPSG:4326', scale: scale});
}


/*  ------- FUNCTIONS FOR PROCESSING AND CLASSIFYING INPUTS ------- */

var x;

// Extracts the dataset image, does any preprocessing
// CHANGE TO PSL, comment it
function prepareDataset(variable, datasetPaths, roi, isNonForest) {
  var path = datasetPaths
    .filter(ee.Filter.eq('name', variable))
    .first()
    .get('path')
    .getInfo();

  if (variable === 'soilLoss') {
    return ee.Image(1)
      .multiply(ee.Image(path + 'R_fac_India'))
      .multiply(ee.Image(path + 'K_fac_India'))
      .multiply(ee.Image(path + 'LS_fac_India'))
      .multiply(ee.Image(path + 'C_fac_India'))
      .multiply(ee.Image(path + 'P_fac_India'))
      .clip(roi.geometry());
  }

  var img = ee.ImageCollection(getImgCollection(path)).mosaic();

  if (variable === 'distForestEdge') {
    img = isNonForest
      ? img.select('dist_forest_edge_nonforest')
      : img.select('dist_forest_edge_forest');
    return img.clip(roi.geometry())
  }

  if (variable === 'patchArea') return img.select('area_m2').clip(roi.geometry());
  if (variable === 'LSI')
    return img.select('perimeter_m')
              .divide(img.select('area_m2').sqrt())
              .clip(roi.geometry());

  if (variable === 'LTP') return img.select('large_tree_patch').clip(roi.geometry());

  return img.clip(roi.geometry());
}

// // Classifies a variable according to its labels in inputThresholds
function classifyVariable(variable, inputThresholds, datasets, roi, isNonForest) {
  var data = inputThresholds.filter(ee.Filter.eq('name', variable)).first();
  var labels = ee.List(ee.String(data.get('labels')).split(',')).getInfo();
  var thresholds = ee.List(ee.String(data.get('thresholds')).split(',')).getInfo();
  var dataset = prepareDataset(variable, datasets,roi, isNonForest);

  var classification = ee.Image(4).reproject(dataset.projection()).rename(variable);
  for (var i = 0; i < thresholds.length; i++) {
    var label = ee.Number(+labels[i]);
    // If the interval is a range, e.g. 0-50 maps to 1
    if (thresholds[i].indexOf('-') !== -1) {
      var interval = thresholds[i].split('-');
      var bottom = interval[0];
      var top = interval[1];
      if (top === 'posInf') {
      var bottom_num = ee.Number(+bottom);
      classification = classification.where(dataset.gte(bottom_num), label);
    }
      else if (bottom === 'negInf') {
        var top_num = ee.Number(+top);
        classification = classification.where(dataset.lte(top_num), label);
      }
      else {
        var top_num = ee.Number(+top);
        var bottom_num = ee.Number(+bottom);
        classification = classification.where(dataset.lte(top_num).and(dataset.gte(bottom_num)), label);
      }
    }
    
    // If the interval is a value (like a class code), e.g. AWC=3 maps to 1
    else {
      var val = ee.Number(+thresholds[i]);
      classification = classification.where(dataset.eq(val), label);
    }
  }
  
  return classification.updateMask(dataset);
}

// Builds classified images for all variables
function buildClassificationStack(variables, thresholds, datasets, roi, isNonForest) {
  var img = ee.Image(1);
  variables.forEach(function(v) {
    img = img.addBands(classifyVariable(v, thresholds, datasets, roi, isNonForest));
  });
  return img;
}

// Does weighted aggregation
function weightedMean(image, weights, name) {
  var sum = ee.Image(0);
  var wSum = ee.Number(0);

  weights.forEach(function(w) {
    sum = sum.add(image.select(w.band).multiply(w.weight));
    wSum = wSum.add(w.weight);
  });

  var mean = sum.divide(wSum).rename('mean_' + name);
  var final = mean.round().rename('final_' + name);

  return image.addBands(mean).addBands(final);
}

// Generates restoration map using relevant submaps e.g. ecological suitability
function buildRestorationMap(config) {
  var classified = buildClassificationStack(
    config.variables,
    config.thresholds,
    config.datasets,
    config.roi,
    config.isNonForest
  );

  var submaps = ee.Image([]);

  config.submaps.forEach(function(m) {
    var subMap = weightedMean(
      classified.select(m.bands),
      m.weights,
      m.name
    );
    submaps = submaps.addBands(subMap);
  });

  return weightedMean(submaps, config.finalWeights, config.outputName);
}


/*  ------- FUNCTIONS FOR BUILDING FOREST TYPE MASKS ------- */

var x;

// Returns historically forested and recently forested as BINARY images (0/1)
// Use .selfMask to get a true mask
function historicalDeforestedMasks(roi, currentForest) {
  var forest_85_00 = getImgCollection('projects/ee-ictd-dhruvi/assets/anoushka/forested_1985_2000_union')
    .mosaic()
    .clip(roi.geometry())
    .unmask(0)          // 0 where not forested
    .gt(0);             // binary 1/0

  var forest_00_onwards = getImgCollection('projects/ee-ictd-dhruvi/assets/anoushka/forested_2000_onwards_union')
    .mosaic()
    .clip(roi.geometry())
    .unmask(0)
    .gt(0);

  var current_forest = currentForest
    .clip(roi.geometry())
    .unmask(0)
    .gt(0);

  // Historically forested:
  // forested in 1985–2000
  // AND NOT forested in 2000+
  // AND NOT forested currently
  var historically_forested = forest_85_00
    .and(forest_00_onwards.not())
    .and(current_forest.not())
    .rename('historical_forest');

  // Recently forested:
  // forested in 2000+
  // AND NOT forested currently
  var recently_forested = forest_00_onwards
    .and(current_forest.not())
    .rename('recent_forest');

  return historically_forested
    .addBands(recently_forested);
}

// Wholly deforested vs fragmented binary images
function deforestationType(roi, currentForest, currentTreeCover) {
  var current_tc = currentTreeCover
    .clip(roi.geometry())
    .unmask(0)
    .gt(0);
  var current_forest = currentForest
    .clip(roi.geometry())
    .unmask(0)
    .gt(0);
  
  // Not forested and also not under tree cover
  var wholly_deforested = 
    current_forest.not()
    .and(current_tc.not())
    .rename('wholly_deforested');
  // Not forested but has some tree cover
  var fragmented = 
    current_forest.not()
    .and(current_tc)
    .rename('fragmented');
    
  return wholly_deforested.addBands(fragmented);

}

// Returns Forested since '85, Forested since 2000, Forested with disturbances
// Binary images not masks
function historicalForestedMasks(roi, currentForest) {
  var forest_since_85 = getImgCollection('projects/ee-ictd-dhruvi/assets/anoushka/forested_since_1985')
    .mosaic()
    .clip(roi.geometry())
    .unmask(0)         
    .gt(0)
    .rename('forest_since_85');           

  var forest_since_00 = getImgCollection('projects/ee-ictd-dhruvi/assets/anoushka/forested_since_2000')
    .mosaic()
    .clip(roi.geometry())
    .unmask(0)
    .gt(0)
    .rename('forest_since_00');

  var disturbed_forest = forest_since_85.not().rename('disturbed_forest');
  return forest_since_85.addBands([forest_since_00, disturbed_forest]);
}

// Intact vs degraded binary images
function forestType(roi, currentForest) {
  var current_forest = currentForest
    .clip(roi.geometry())
    .unmask(0)
    .gt(0);
  var cch = CanopyHealthChange.mosaic().clip(roi.geometry());
  /* 
    Canopy Change Health -> Forest Mask
    Missing Data: 5                                               -> Unclassified: 0
    Deforestation: -1, Degradation: -2, Partially Degraded: 3, 4  -> Degraded: 1
    No Change: 0, Improvement: 1, Afforestation: 2                -> Intact: 2
  */

var canopyClassified = cch.remap([-2,-1,0,1,2,3,4,5], [1,1,2,2,2,1,1,0]);
var intact = current_forest.and(canopyClassified.eq(2)).rename('intact_forest');
var degraded = current_forest.and(canopyClassified.eq(1)).rename('degraded_forest');
return intact.addBands(degraded);
}

// Helper to apply multiple masks
function applyMasks(image, maskDict) {
  var out = ee.Image([]);

  Object.keys(maskDict).forEach(function(name) {
    var masked = image
      .updateMask(maskDict[name].selfMask())
      .rename(name);

    out = out.addBands(masked);
  });

  return out;
}

// Build final masked Priority Score image for Deforested Areas
function finalDeforestedMap(deforestedMap, roi, currentForest, currentTreeCover) {
  var hist = historicalDeforestedMasks(roi, currentForest);
  var types = deforestationType(roi, currentForest, currentTreeCover);

  var masks = {
    historical_forest_wholly_deforested:
      hist.select('historical_forest').and(types.select('wholly_deforested')),

    historical_forest_fragmented:
      hist.select('historical_forest').and(types.select('fragmented')),

    recent_forest_wholly_deforested:
      hist.select('recent_forest').and(types.select('wholly_deforested')),

    recent_forest_fragmented:
      hist.select('recent_forest').and(types.select('fragmented')),
  };

  return applyMasks(deforestedMap, masks);
}

// Build final masked Priority Score image for Forested Areas
function finalForestedMap(forestedMap, roi, currentForest) {
  var hist = historicalForestedMasks(roi, currentForest);
  var types = forestType(roi, currentForest);

  var masks = {
    forested_since_85_intact:
      hist.select('forest_since_85').and(types.select('intact_forest')),

    forested_since_85_degraded:
      hist.select('forest_since_85').and(types.select('degraded_forest')),

    forested_since_00_intact:
      hist.select('forest_since_00').and(types.select('intact_forest')),

    forested_since_00_degraded:
      hist.select('forest_since_00').and(types.select('degraded_forest')),

    disturbed_forest_intact:
      hist.select('disturbed_forest').and(types.select('intact_forest')),

    disturbed_forest_degraded:
      hist.select('disturbed_forest').and(types.select('degraded_forest'))
  };

  return applyMasks(forestedMap, masks);
}


/*  ------- INPUTS ------- */

var datasets = ee.FeatureCollection([
  ee.Feature(null, {name : 'soilLoss', path : 'projects/ee-mtpictd/assets/anoushka/'}),
  ee.Feature(null, {name : 'distForestEdge', path : 'projects/ee-mtpictd/assets/anoushka/forest_edge_dist_2023/' }),
  ee.Feature(null, {name : 'distSettlements', path : 'projects/ee-mtpictd/assets/anoushka/settlement_distances/' }),
  ee.Feature(null, {name : 'distRoads', path : 'projects/ee-mtpictd/assets/anoushka/road_distances/' }),
  ee.Feature(null, {name : 'patchArea', path : 'projects/ee-mtpictd/assets/anoushka/LTP_area_perim_2023/' }),
  ee.Feature(null, {name : 'LSI', path : 'projects/ee-mtpictd/assets/anoushka/LTP_area_perim_2023/' }),
  ee.Feature(null, {name : 'interpatchDist', path : 'projects/ee-mtpictd/assets/anoushka/forest_interpatch_dist_2023/'}),
  ee.Feature(null, {name : 'LTP', path : 'projects/ee-mtpictd/assets/anoushka/LTP_area_perim_2023/'})
  ]);

var inputThresholds = ee.FeatureCollection([
  ee.Feature(null, {name: 'soilLoss', labels: '3,2,1', thresholds: 'negInf-50,50-500,500-posInf'}),
  ee.Feature(null, {name: 'distForestEdge', labels: '1,2,3,4', thresholds: 'negInf-100,100-500,500-1000,1000-posInf'}),
  ee.Feature(null, {name: 'distSettlements', labels: '4,3,2,1', thresholds: 'negInf-1500,1500-2000,2000-2500,2500-posInf'}),
  ee.Feature(null, {name: 'distRoads', labels: '4,3,2,1', thresholds: 'negInf-50,50-250,250-500,500-posInf'}),
  ee.Feature(null, {name: 'patchArea', labels: '4,3,2,1', thresholds: 'negInf-1000000,1000000-5000000,5000000-10000000,10000000-posInf'}),
  ee.Feature(null, {name: 'interpatchDist', labels: '1,2,3,4', thresholds: 'negInf-300,300-750,750-1000,1000-posInf'}),
  ee.Feature(null, {name: 'LSI', labels: '4,3,2,1', thresholds: 'negInf-1.6,1.6-1.9,1.9-2.2,2.2-posInf'})
]);

var nonForestVariables = [
  'soilLoss',
  'distForestEdge',
  'distSettlements',
  'distRoads'
  ]

var forestVariables = [
  'soilLoss',
  'distForestEdge',
  'distSettlements',
  'distRoads',
  'patchArea',
  'LSI',
  'interpatchDist'
  ]

var riskWeights = [
  { band : 'soilLoss', weight : 0.5 },
  { band : 'distForestEdge', weight : 0.5 }
];

var socioEcoWeights = [
  { band : 'distRoads', weight : 0.5 },
  { band : 'distSettlements', weight : 0.5 }
];

var ecoSuitWeights = [
  { band : 'patchArea', weight : 0.33 },
  { band : 'LSI', weight : 0.33 },
  { band : 'interpatchDist', weight : 0.34 }
];

var nonForestFinalWeights = [
  { band : 'final_degradation_risk', weight : 0.5 },
  { band : 'final_socioeconomic_suitability', weight : 0.5 },
];

var forestFinalWeights = [
  { band : 'final_degradation_risk', weight : 0.33 },
  { band : 'final_socioeconomic_suitability', weight : 0.33 },
  { band : 'final_ecological_suitability', weight : 0.34 }
];


/*  ------- BUILDING RESTORATION PRIORITY MAPS ------- */

var india = ee.FeatureCollection("projects/ee-mtpictd/assets/harsh/Agroclimatic_regions");
var karnataka = ee.Feature(ee.FeatureCollection('FAO/GAUL/2015/level1').filter(ee.Filter.eq('ADM1_NAME', 'Karnataka')).first());
var kolar = ee.Feature(ee.FeatureCollection('FAO/GAUL/2015/level2').filter(ee.Filter.eq('ADM2_NAME', 'Kolar')).first());

var year = 2023;
var scale = 100;

var aczList = [
'Eastern Plateau & Hills Region', // STARTED
'Southern Plateau and Hills Region', // STARTED
'East Coast Plains & Hills Region', // STARTED
'Western Plateau and Hills Region', // STARTED
'Central Plateau & Hills Region', // STARTED
'West Coast Plains & Ghat Region', // STARTED
'Lower Gangetic Plain Region', // STARTED
'Middle Gangetic Plain Region', // STARTED
'Eastern Himalayan Region', // STARTED
'Western Himalayan Region', // STARTED
'Upper Gangetic Plain Region', // STARTED
'Trans Gangetic Plain Region', // STARTED
'Gujarat Plains & Hills Region', // STARTED
'Western Dry Region' // STARTED
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

var acz = 'Western Dry Region';
var roi = india.filter(ee.Filter.eq('regionname', acz)).first();

// Map I: Deforested areas
var nonForestMap = buildRestorationMap({
  roi: roi,
  scale: scale,
  datasets: datasets,
  thresholds: inputThresholds,
  
  isNonForest: true,
  
  variables: nonForestVariables,
  submaps: [
    { name: 'degradation_risk', bands: ['soilLoss','distForestEdge'], weights: riskWeights },
    { name: 'socioeconomic_suitability', bands: ['distRoads','distSettlements'], weights: socioEcoWeights },
  ],
  
  finalWeights: nonForestFinalWeights,
  outputName: 'restoration_priority_nonforest'
});

// print(nonForestMap);

// Map II: Forested areas
var forestMap = buildRestorationMap({
  
  roi: roi,
  scale: scale,
  datasets: datasets,
  thresholds: inputThresholds,
  
  isNonForest: false,
  
  variables: forestVariables,
  submaps: [
    { name: 'degradation_risk', bands: ['soilLoss','distForestEdge'], weights: riskWeights },
    { name: 'socioeconomic_suitability', bands: ['distRoads','distSettlements'], weights: socioEcoWeights },
    { name: 'ecological_suitability', bands: ['patchArea','LSI','interpatchDist'], weights: ecoSuitWeights }
  ],
  
  finalWeights: forestFinalWeights,
  outputName: 'restoration_priority_forest'
  
});
// print(forestMap);

// Export

var nonForestExport = nonForestMap.select([
  'mean_degradation_risk', 
  'final_degradation_risk', 
  'mean_socioeconomic_suitability', 
  'final_socioeconomic_suitability',
  'mean_restoration_priority_nonforest',
  'final_restoration_priority_nonforest']);

var forestExport = forestMap.select([
  'mean_degradation_risk', 
  'final_degradation_risk', 
  'mean_socioeconomic_suitability', 
  'final_socioeconomic_suitability',
  'mean_ecological_suitability', 
  'final_ecological_suitability',
  'mean_restoration_priority_forest',
  'final_restoration_priority_forest']);

Export.image.toAsset({
  image: nonForestExport,
  description: aczAcronymDict[acz] + '_RPS_NonForest',
  assetId:
    'projects/ee-mtpictd/assets/anoushka/restoration_priority_score_nonforest/' +
    aczAcronymDict[acz],
  region: roi.geometry(),
  scale: scale,
  maxPixels: 1e13
});

Export.image.toAsset({
  image: forestExport,
  description: aczAcronymDict[acz] + '_RPS_Forest',
  assetId:
    'projects/ee-mtpictd/assets/anoushka/restoration_priority_score_forest/' +
    aczAcronymDict[acz],
  region: roi.geometry(),
  scale: scale,
  maxPixels: 1e13
});


/*  ------- CLASSIFYING AND MASKING ------- */

var x;

// // Current forest cover 
// var ltp_2023 = getImgCollection('projects/ee-mtpictd/assets/anoushka/LTP_area_perim_2023')
//               .select('large_tree_patch')
//               .mosaic().clip(roi.geometry());

// // Mask forested RPS map to get final layers
// var finalForestRPS = forestMap.select('final_restoration_priority_forest');
// var finalForestMap = finalForestedMap(finalForestRPS, roi, ltp_2023);

// // Current tree cover
// var tree_cover_2023 = getTreeCover(roi, 2023, scale);

// // Mask deforested RPS map to get final layers
// var finalNonForestRPS = nonForestMap.select('final_restoration_priority_nonforest');
// var finalNonForestMap = finalDeforestedMap(finalNonForestRPS, roi, ltp_2023, tree_cover_2023);

var y;


/*  ------- VISUALIZATION ------- */


var palette = ["147218", "8562EA", "f2fe2a", "ffac18"];
var visparams = {
  "opacity": 1,
    "min": 1,
    "max": 4,
    "palette": palette
};
var names = [ 'High', 'Moderate', 'Marginal', 'Low'];

// Set up legend

var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});
var makeRow = function(color, name) {
      var colorBox = ui.Label({
        style: {
          backgroundColor: '#' + color,
          padding: '8px',
          margin: '0 0 4px 0'
        }
      });
 
      var description = ui.Label({
        value: name,
        style: {margin: '0 0 4px 6px'}
      });
  
      return ui.Panel({
        widgets: [colorBox, description],
        layout: ui.Panel.Layout.Flow('horizontal')
      });
};

for (var i = 0; i < 4; i++) {
  legend.add(makeRow(palette[i], names[i]));
  }  

// Map.add(legend);

// var bandNames = forestMap.bandNames();

// // Add each band to the map with its name as the layer title
// bandNames.evaluate(function(bands) {
//   bands.forEach(function(bandName) {
//     Map.addLayer(forestMap.select(bandName), visparams, 'Forest ' + bandName);
//   });
// });

// Map.centerObject(roi, 6);





