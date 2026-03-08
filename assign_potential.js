
// Helper
function getImgCollection(folderPath) {
  var assetList = ee.data.getList({ id: folderPath });
  
  var imageList = assetList.map(function(asset) {
    return ee.Image(asset.id);
  });
  
  return ee.ImageCollection.fromImages(imageList);
}


// Pan-India clustering image
// Bands: regioncode, snic_id, SNUM, kmeans_id
var clusters = ee.Image('projects/ee-mtpictd/assets/anoushka/india_multilevel_ecological_clusters_100m_incremented');

// Tree cover mask
var treeMask = getImgCollection('projects/ee-mtpictd/assets/anoushka/LTP_area_perim_2023')
  .mosaic().select('large_tree_patch')
  .rename('tree')
  .toInt();

// CCD image (masked where missing data)
var ccd = getImgCollection('projects/ee-mtpictd/assets/anoushka/ccd_potential_2022')
          .select('ccd').mosaic()
          .reproject({
            crs: 'EPSG:4326',
            scale: 100
          });


// Parameters

var scale = 100;          // meters
var maxPixels = 1e13;


// First we build unique cluster IDs and snic IDs
// So aggregating by these properties is easier later

// cluster_uid = regioncode | snic_id | SNUM | kmeans_id
var clusterUID = clusters.expression(
  'r * 1e8 + s * 1e6 + so * 1e2 + k',
  {
    r: clusters.select('regioncode'),
    s: clusters.select('snic_id'),
    so: clusters.select('SNUM'),
    k: clusters.select('kmeans_id')
  }
).rename('cluster_uid').toInt64();

// snic_uid = regioncode | snic_id
var snicUID = clusters.expression(
  ' r * 1e3 + s',
  {
    r: clusters.select('regioncode'),
    s: clusters.select('snic_id'),
  }
  
).rename('snic_uid').toInt64();


// Build bands for counting number of pixels etc 

// Total number of pixels
var nPixels = ee.Image.constant(1)
  .rename('n_pixels')
  .updateMask(clusters.select('regioncode').mask());

// Number of tree pixels
var nTreePixels = ee.Image.constant(1)
  .updateMask(treeMask)
  .rename('n_tree_pixels');

// Number of tree pixels with valid CCD
var nTreeCCD = ee.Image.constant(1)
  .updateMask(treeMask)
  .updateMask(ccd.mask())
  .rename('n_tree_pixels_with_ccd');

// Number of pixels with valid CCD
var nCCD = ee.Image.constant(1)
  .updateMask(ccd.mask())
  .rename('n_ccd_pixels');


// Stack images

 var aggImage = ee.Image.cat([
  nPixels,
  nTreePixels,
  nTreeCCD,
  nCCD,
  clusterUID   // group band LAST
]);



// This dictionary contains the number of pixels, tree pixels, 
// tree CCD pixels, CCD pixels in every cluster

var statsDict = aggImage.reduceRegion({
  reducer: ee.Reducer.sum()
    .repeat(4)
    .group({
      groupField: 4,
      groupName: 'cluster_uid'
    }),
  geometry: clusters.geometry(),
  scale: scale,
  maxPixels: maxPixels
});

// print(ee.List(statsDict.get('groups')).slice(0,10));

// This dictionary contains the 90th percentile CCD value in every cluster
var percentileStatsDict = ee.Image.cat([ccd, clusterUID]).reduceRegion({
  reducer: ee.Reducer.percentile([90])
          .group({
            groupField: 1,
            groupName: 'cluster_uid'
          }),
  geometry: clusters.geometry(),
  scale: scale,
  maxPixels: maxPixels
  });

// Convert the above object into a direct mapping
// cluster_uid : 90th percentile CCD
var list = ee.List(percentileStatsDict.get('groups'));
var keys = list.map(function(d) {
  return ee.String(ee.Dictionary(d).get('cluster_uid'));
});
var values = list.map(function(d) {
  return ee.Dictionary(d).get('p90', -1);
});

var percentileDict = ee.Dictionary.fromLists(keys, values);



// Build full cluster table containing all properties 

var clusterTable = ee.FeatureCollection(
  ee.List(statsDict.get('groups')).map(function(d) {
    d = ee.Dictionary(d);

    var uid = ee.Number(d.get('cluster_uid'));
    var uid_str = ee.String(d.get('cluster_uid'));

    // Decode cluster UID
    var regioncode = uid.divide(1e8).floor().toInt();
    var snic_id = uid.mod(1e8).divide(1e6).floor().toInt();
    var SNUM = uid.mod(1e6).divide(1e2).floor().toInt();
    var kmeans_id = uid.mod(1e2).toInt();
    
    // Decode snic UID
    var snic_uid = regioncode.multiply(1e3).add(snic_id).toInt();
    
    // If cluster has >= 50 valid CCD pixels, it's valid
    var is_valid = ee.Number(ee.List(d.get('sum')).get(3)).toInt().gte(50);
    
    return ee.Feature(null, {
      regioncode: regioncode,
      snic_id: snic_id,
      SNUM: SNUM,
      kmeans_id: kmeans_id,
      n_pixels: ee.Number(ee.List(d.get('sum')).get(0)).toInt(),
      n_tree_pixels: ee.Number(ee.List(d.get('sum')).get(1)).toInt(),
      n_tree_pixels_with_ccd: ee.Number(ee.List(d.get('sum')).get(2)).toInt(),
      
      n_ccd_pixels: ee.Number(ee.List(d.get('sum')).get(3)).toInt(),
      ccd_potential: ee.Number(percentileDict.get(uid_str)).toInt(),
      cluster_uid: uid,
      snic_uid: snic_uid,
      is_valid: is_valid
    });
  })
);

// print(clusterTable.limit(10));
// print(clusterTable.aggregate_array('regioncode').distinct());
// print(clusterTable.aggregate_array('snic_id').distinct());
// print(clusterTable.aggregate_array('SNUM').distinct());
// print(clusterTable.aggregate_array('kmeans_id').distinct());

// print(clusterTable.aggregate_array('cluster_uid').distinct().length());

// Get mode ccd_potential in a SNIC over all valid clusters

var validClusters = clusterTable.filter(ee.Filter.eq('is_valid', 1));
var modePotential = validClusters.reduceColumns({
  selectors: ['ccd_potential', 'snic_uid'],
  reducer: ee.Reducer.mode().group({
    groupField: 1,   // index of snic_uid
    groupName: 'snic_uid'
  })
});

// Convert into a mapping
// snic_uid : mode ccd_potential
var list = ee.List(modePotential.get('groups'));
var keys = list.map(function(d) {
  return ee.String(ee.Dictionary(d).get('snic_uid'));
});
var values = list.map(function(d) {
  return ee.Dictionary(d).get('mode');
});

var modeDict = ee.Dictionary.fromLists(keys, values);


// Wherever the initial cluster table has invalid clusters,
// Set their CCD potential as the mode CCD potential of the SNIC they belong to
var updatedClusterTable = clusterTable.map(function(f) {

  var isValid = ee.Number(f.get('is_valid'));
  var snicUidStr = ee.String(f.get('snic_uid'));

  // Get mode value for this snic_uid (default -1 if missing)
  var modeValue = ee.Number(modeDict.get(snicUidStr, -1)).toInt();

  // If NOT valid, replace ccd_potential
  // Else keep old value
  var newPotential = ee.Algorithms.If(
    isValid.eq(0),
    modeValue,
    f.get('ccd_potential')
  );

  return f.set('ccd_potential', ee.Number(newPotential).toInt());
});


// // Export

// var keepProps = [
//   'regioncode',
//   'snic_id',
//   'SNUM',
//   'kmeans_id',
//   'n_pixels',
//   'n_ccd_pixels',
//   'n_tree_pixels',
//   'n_tree_pixels_with_ccd',
//   'ccd_potential'
// ];

// updatedClusterTable = updatedClusterTable.select(keepProps);
// print(updatedClusterTable.limit(10));


// Export.table.toAsset({
//   collection: updatedClusterTable,   // your FeatureCollection
//   description: 'India_KMeans_Cluster_Stats_Asset',
//   assetId: 'projects/ee-mtpictd/assets/anoushka/india_multilevel_ecological_clustering_stats'
// });


// Visualize

var fc = ee.FeatureCollection('projects/ee-mtpictd/assets/anoushka/india_multilevel_ecological_clustering_stats');

// Compute cluster_uid for entries in table
var tableWithId = fc.map(function(f) {
  var id = ee.Number(f.get('regioncode')).multiply(1e8)
    .add(ee.Number(f.get('snic_id')).multiply(1e6))
    .add(ee.Number(f.get('SNUM')).multiply(1e2))
    .add(ee.Number(f.get('kmeans_id')));
    
  return f.set('cluster_uid', id);
});

// Map cluster_uid to ccd_potential
var idList = tableWithId.aggregate_array('cluster_uid');
var valueList = tableWithId.aggregate_array('ccd_potential');

var ccdPotential = clusterUID.remap(idList, valueList)
                        .rename('ccd_potential');

ccd = ccd.updateMask(ccd.mask().gt(0));
var ccdMax = ccdPotential.where(ccd.mask(), ccdPotential.max(ccd));

// var box = ccdImage.clip(geometry.geometry());

// var stats = box.reduceRegion({
//   reducer: ee.Reducer.frequencyHistogram(),
//   geometry: geometry.geometry(),
//   scale: 100,
//   maxPixels: 1e13
// });

// print(stats);


var visParams = {
  min: -1,
  max: 2,
  // palette: [
  //   '#bdbdbd',  // -1  → null (gray)
  //   '#ffffcc',  //  0  → low (light yellow)
  //   '#41ab5d',  //  1  → medium (green)
  //   '#00441b'   //  2  → high (dark green)
  // ]
  palette: [
    '#000000',  //  null (-1)
    '#ffa500',  //  low (0)
    '#dee64c',  //  medium (1)
    '#007500'  //  high (2)
  ]
  // palette: [
  //   '#bdbdbd',  // -1  → null (gray)
  //   '#ffffcc',  //  0  → low (light yellow)
  //   '#ffffcc',  //  1  → medium (green)
  //   '#ffffcc'   //  2  → high (dark green)
  // ]
};

Map.addLayer(ccdPotential, visParams, 'CCD Potential (Original)');
Map.addLayer(ccdMax, visParams, 'CCD Potential (Maxed with CCD)');
Map.addLayer(ccd, visParams, 'CCD');

var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

var legendTitle = ui.Label({
  value: 'CCD',
  style: {fontWeight: 'bold', fontSize: '14px', margin: '0 0 6px 0'}
});

legend.add(legendTitle);

// Legend entries
var labels = [
  {name: 'Null', color: '#000000'},
  {name: 'Low (0)', color: '#ffa500'},
  {name: 'Medium (1)', color: '#dee64c'},
  {name: 'High (2)', color: '#007500'}
];

labels.forEach(function(item) {
  var colorBox = ui.Label('', {
    backgroundColor: item.color,
    padding: '8px',
    margin: '0 0 4px 0'
  });

  var description = ui.Label({
    value: item.name,
    style: {margin: '0 0 4px 6px'}
  });

  legend.add(
    ui.Panel({
      widgets: [colorBox, description],
      layout: ui.Panel.Layout.Flow('horizontal')
    })
  );
});

Map.add(legend);
