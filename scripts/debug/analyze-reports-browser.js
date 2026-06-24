/**
 * Browser-based Report Data Structure Analyzer
 * 
 * Run this in your browser console while logged into the app
 * to analyze all report data structures.
 */

async function analyzeReportsInBrowser() {
  console.log('🚀 Starting browser-based report analysis...');

  // Get API base URL and access token from the React app
  const API_BASE_URL = window.location.origin + '/api';
  
  // Try to get access token from localStorage or session
  let accessToken = localStorage.getItem('access_token') || 
                   sessionStorage.getItem('access_token') ||
                   localStorage.getItem('authToken') ||
                   sessionStorage.getItem('authToken');

  if (!accessToken) {
    console.error('❌ Could not find access token. Please make sure you are logged in.');
    console.log('💡 Try running this in the browser console after logging into the app.');
    return;
  }

  console.log('✅ Found access token');

  const commonHeaders = {
    'Accept': 'application/json, text/plain, */*',
    'Authorization': accessToken,
    'Content-Type': 'application/json'
  };

  // Fetch reports list
  console.log('📋 Fetching reports list...');
  
  try {
    const reportsResponse = await fetch(`${API_BASE_URL}/reports`, {
      method: 'GET',
      headers: commonHeaders,
    });

    if (!reportsResponse.ok) {
      throw new Error(`HTTP error! status: ${reportsResponse.status}`);
    }

    const reports = await reportsResponse.json();
    console.log(`✅ Found ${reports.length} reports`);

    const results = [];

    // Analyze each report
    for (let i = 0; i < Math.min(reports.length, 10); i++) { // Limit to first 10 for browser analysis
      const report = reports[i];
      console.log(`📊 Analyzing report ${i + 1}: ${report.name}`);

      try {
        const dataResponse = await fetch(`${API_BASE_URL}/reports/${report.uuid}?action=run&limit=3`, {
          method: 'GET',
          headers: commonHeaders,
        });

        if (!dataResponse.ok) {
          throw new Error(`HTTP error! status: ${dataResponse.status}`);
        }

        const data = await dataResponse.json();
        
        const analysis = {
          uuid: report.uuid,
          name: report.name,
          structure: {
            topLevelKeys: Object.keys(data),
            type: data.type,
            hasTable: !!data.table,
            hasData: !!data.data,
            hasFields: !!data.fields
          },
          sampleData: {}
        };

        // Analyze table structure
        if (data.table) {
          analysis.structure.table = {
            keys: Object.keys(data.table),
            type: data.table.type,
            hasData: !!data.table.data,
            hasFields: !!data.table.fields,
            dataLength: data.table.data ? data.table.data.length : 0,
            fieldsLength: data.table.fields ? data.table.fields.length : 0
          };

          if (data.table.data && data.table.data.length > 0) {
            const firstRow = data.table.data[0];
            analysis.structure.table.sampleRowKeys = Object.keys(firstRow);
            
            // Check if data is nested in .data properties
            const fieldAnalysis = {};
            Object.keys(firstRow).forEach(key => {
              const value = firstRow[key];
              fieldAnalysis[key] = {
                type: typeof value,
                isNested: value && typeof value === 'object' && 'data' in value,
                hasData: value && typeof value === 'object' && 'data' in value,
                hasColor: value && typeof value === 'object' && 'color' in value,
                hasMethod: value && typeof value === 'object' && 'method' in value,
                sampleValue: value && typeof value === 'object' && 'data' in value ? value.data : value
              };
            });
            analysis.structure.table.fieldAnalysis = fieldAnalysis;
          }

          if (data.table.fields) {
            analysis.sampleData.tableFields = data.table.fields.slice(0, 3);
          }
        }

        // Analyze direct data structure
        if (data.data) {
          analysis.structure.directData = {
            isArray: Array.isArray(data.data),
            length: Array.isArray(data.data) ? data.data.length : 0
          };
        }

        if (data.fields) {
          analysis.sampleData.directFields = data.fields.slice(0, 3);
        }

        results.push(analysis);
        console.log(`✅ Analyzed: ${report.name}`);

        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ Failed to analyze ${report.name}:`, error);
        results.push({
          uuid: report.uuid,
          name: report.name,
          error: error.message
        });
      }
    }

    // Log summary
    console.log('\n📊 ANALYSIS RESULTS:');
    console.log('===================');
    
    const patterns = {};
    results.forEach(result => {
      if (!result.error) {
        const pattern = `${result.structure.hasTable ? 'table' : 'direct'}-${result.structure.type || 'no-type'}`;
        if (!patterns[pattern]) {
          patterns[pattern] = [];
        }
        patterns[pattern].push(result.name);
      }
    });

    Object.entries(patterns).forEach(([pattern, reportNames]) => {
      console.log(`\n🏗️ Pattern: ${pattern}`);
      console.log(`   Reports (${reportNames.length}): ${reportNames.join(', ')}`);
    });

    // Show detailed structure for each unique pattern
    console.log('\n🔍 DETAILED STRUCTURES:');
    console.log('======================');
    
    const uniqueStructures = new Map();
    results.forEach(result => {
      if (!result.error && result.structure.table) {
        const structureKey = JSON.stringify({
          type: result.structure.type,
          tableType: result.structure.table.type,
          hasTableData: result.structure.table.hasData,
          hasTableFields: result.structure.table.hasFields
        });
        
        if (!uniqueStructures.has(structureKey)) {
          uniqueStructures.set(structureKey, {
            structure: result.structure,
            examples: []
          });
        }
        uniqueStructures.get(structureKey).examples.push(result.name);
      }
    });

    uniqueStructures.forEach((info, key) => {
      console.log(`\n📋 Structure: ${key}`);
      console.log(`   Examples: ${info.examples.slice(0, 3).join(', ')}`);
      if (info.structure.table && info.structure.table.fieldAnalysis) {
        console.log('   Field patterns:');
        Object.entries(info.structure.table.fieldAnalysis).slice(0, 5).forEach(([field, analysis]) => {
          console.log(`     ${field}: ${analysis.isNested ? 'NESTED' : 'DIRECT'} (${analysis.type})`);
        });
      }
    });

    // Store results globally for inspection
    window.reportAnalysisResults = results;
    console.log('\n💾 Results stored in window.reportAnalysisResults for inspection');

    return results;

  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

// Export for use
window.analyzeReportsInBrowser = analyzeReportsInBrowser;

console.log('📊 Report analyzer loaded! Run analyzeReportsInBrowser() to start analysis.');