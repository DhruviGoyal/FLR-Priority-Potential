
// Helper function to compute number of clusters formed
// if SNIC is done using spacing values in (start, end)
function spacingClusterMap(roi, scale, features, start, end) {
  var spacings = ee.List.sequence(start, end);

  var results = spacings.map(function(sp) {
    sp = ee.Number(sp);
    // Do SNIC clustering with given spacing
    var clusters = ee.Algorithms.Image.Segmentation.SNIC({
      image: features,
      size: sp,
      compactness: 0,
      neighborhoodSize: 2 * sp
    }).clip(roi.geometry());
  
    var clusterBand = clusters.select('clusters');
    // Count number of clusters formed
    var nClusters = clusterBand.reduceRegion({
      reducer: ee.Reducer.countDistinctNonNull(),
      geometry: roi.geometry(),
      scale: scale,
      maxPixels: 1e13
    }).get('clusters');

    return ee.Feature(null, {
      spacing: sp,
      nClusters: nClusters
    });
  });

  var resultsFC = ee.FeatureCollection(results);
  return resultsFC;
}

// Returns size of spacing grid to get targetNClusters number of superpixels
// Optionally specify search space (start, end)
// Optionally print graph of spacing vs number of clusters
exports.snicSpacingSearch = function(features, roi, scale, targetNClusters, start, end, printChart) {
  printChart = (printChart === undefined) ? false : printChart;
  roi = ee.Feature(roi);

  // Determine search space
  var searchStart, searchEnd;

  if (start === undefined || end === undefined) {
    var area = roi.geometry().area(100);
    
    // approx spacing ≈ sqrt(area / targetNClusters)
    var approxSpacing = area
      .divide(targetNClusters)
      .divide(scale * scale)
      .sqrt()
      .round();

    searchStart = approxSpacing.subtract(5).max(1);
    searchEnd   = approxSpacing.add(10);
  } 
  else {
    searchStart = ee.Number(start);
    searchEnd   = ee.Number(end);
  }

  var fc = spacingClusterMap(roi, scale, features, searchStart, searchEnd);

  // Choose spacing closest to target
  var best = fc.map(function(f) {
      return f.set(
        'error', ee.Number(f.get('nClusters')).subtract(targetNClusters).abs()
      );
    }).sort('error')
      .first();
  var bestSpacing = ee.Number(best.get('spacing'));

  if (printChart) {
    var chart = ui.Chart.feature.byFeature(
      fc,
      'spacing',
      'nClusters'
    ).setOptions({
      title: 'SNIC spacing search',
      hAxis: { title: 'Spacing' },
      vAxis: { title: 'Number of clusters' },
      lineWidth: 2,
      pointSize: 4
    });

    print(chart);
    print('Best spacing:', bestSpacing);
  }

  return bestSpacing;
}

// Do SNIC Clustering
// Optionally specify compactness and neighbourhood size
exports.snicClusters = function(features, roi, scale, spacing, compactness, neighborhoodSize) {
  // Defaults
  spacing = ee.Number(spacing);
  compactness = (compactness === undefined) ? 0 : compactness;
  compactness = ee.Number(compactness);
  neighborhoodSize = (neighborhoodSize === undefined)
    ? spacing.multiply(2)
    : ee.Number(neighborhoodSize);

  // Run SNIC
  var clusters = ee.Algorithms.Image.Segmentation.SNIC({
    image: features,
    size: spacing,
    compactness: compactness,
    neighborhoodSize: neighborhoodSize
  }).clip(roi.geometry());
  var clusterBand = clusters.select('clusters');

  // Get unique cluster IDs
  var hist = clusterBand.reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: roi.geometry(),
    scale: scale,
    maxPixels: 1e13
  });
  var idDict = ee.Dictionary(hist.get('clusters'));
  var uniqueIds = idDict.keys().map(ee.Number.parse);
  var nClusters = uniqueIds.size();

  // Remap to contiguous IDs: 0..K-1 since by default SNIC uses random ints
  var newIds = ee.List.sequence(0, nClusters.subtract(1));
  clusterBand = clusterBand.remap(uniqueIds, newIds).rename('cluster')
    .reproject({ crs: 'EPSG:4326', scale: scale });

  return clusterBand;
};
