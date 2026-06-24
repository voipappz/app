#!/usr/bin/env node

/**
 * Report Data Structure Analyzer
 * 
 * This script fetches all available reports and their data to analyze
 * the different data structures used across reports.
 */

import fs from 'fs';
import path from 'path';

// Configuration - you'll need to update these with your actual values
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:3000';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'your-access-token-here';

const commonHeaders = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9,he-IL;q=0.8,he;q=0.7',
  'Authorization': ACCESS_TOKEN,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
};

async function fetchReportsList() {
  console.log('📋 Fetching reports list...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/reports`, {
      method: 'GET',
      headers: commonHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reports = await response.json();
    console.log(`✅ Found ${reports.length} reports`);
    return reports || [];
  } catch (error) {
    console.error('❌ Failed to fetch reports list:', error);
    return [];
  }
}

async function fetchReportData(reportUuid, reportName) {
  console.log(`📊 Fetching data for report: ${reportName} (${reportUuid})`);
  
  try {
    const url = `${API_BASE_URL}/api/reports/${reportUuid}?action=run&limit=5`; // Limit to 5 rows for analysis
    
    const response = await fetch(url, {
      method: 'GET',
      headers: commonHeaders,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const data = await response.json();
    console.log(`✅ Successfully fetched data for ${reportName}`);
    
    return {
      uuid: reportUuid,
      name: reportName,
      data: data,
      structure: analyzeStructure(data),
      sampleData: getSampleData(data)
    };
  } catch (error) {
    console.error(`❌ Failed to fetch data for ${reportName}:`, error);
    return {
      uuid: reportUuid,
      name: reportName,
      error: error.message,
      structure: null,
      sampleData: null
    };
  }
}

function analyzeStructure(data) {
  const structure = {
    topLevelKeys: Object.keys(data || {}),
    hasTable: !!data.table,
    hasData: !!data.data,
    hasFields: !!data.fields,
    type: data.type || null,
    tableType: data.table?.type || null,
    dataStructure: null,
    fieldsStructure: null,
    tableStructure: null
  };

  // Analyze table structure if it exists
  if (data.table) {
    structure.tableStructure = {
      keys: Object.keys(data.table),
      hasData: !!data.table.data,
      hasFields: !!data.table.fields,
      dataIsArray: Array.isArray(data.table.data),
      dataLength: Array.isArray(data.table.data) ? data.table.data.length : 0,
      fieldsIsArray: Array.isArray(data.table.fields),
      fieldsLength: Array.isArray(data.table.fields) ? data.table.fields.length : 0,
      type: data.table.type
    };

    // Analyze first data item structure if available
    if (data.table.data && Array.isArray(data.table.data) && data.table.data.length > 0) {
      const firstItem = data.table.data[0];
      structure.tableStructure.sampleDataKeys = Object.keys(firstItem);
      structure.tableStructure.sampleDataTypes = {};
      
      Object.keys(firstItem).forEach(key => {
        const value = firstItem[key];
        structure.tableStructure.sampleDataTypes[key] = {
          type: typeof value,
          isObject: typeof value === 'object' && value !== null,
          hasDataProperty: value && typeof value === 'object' && 'data' in value,
          hasColorProperty: value && typeof value === 'object' && 'color' in value,
          hasMethodProperty: value && typeof value === 'object' && 'method' in value,
          hasParamsProperty: value && typeof value === 'object' && 'params' in value,
          hasIconProperty: value && typeof value === 'object' && 'icon' in value,
        };
      });
    }

    // Analyze fields structure if available
    if (data.table.fields && Array.isArray(data.table.fields) && data.table.fields.length > 0) {
      const firstField = data.table.fields[0];
      structure.tableStructure.sampleFieldKeys = Object.keys(firstField);
    }
  }

  // Analyze direct data structure if it exists
  if (data.data) {
    structure.dataStructure = {
      isArray: Array.isArray(data.data),
      length: Array.isArray(data.data) ? data.data.length : 0,
      type: typeof data.data
    };

    if (Array.isArray(data.data) && data.data.length > 0) {
      const firstItem = data.data[0];
      structure.dataStructure.sampleKeys = Object.keys(firstItem);
    }
  }

  // Analyze fields structure if it exists
  if (data.fields) {
    structure.fieldsStructure = {
      isArray: Array.isArray(data.fields),
      length: Array.isArray(data.fields) ? data.fields.length : 0
    };

    if (Array.isArray(data.fields) && data.fields.length > 0) {
      const firstField = data.fields[0];
      structure.fieldsStructure.sampleKeys = Object.keys(firstField);
    }
  }

  return structure;
}

function getSampleData(data) {
  const sample = {};

  // Get sample from table.data
  if (data.table && data.table.data && Array.isArray(data.table.data) && data.table.data.length > 0) {
    sample.tableData = data.table.data.slice(0, 2); // First 2 items
  }

  // Get sample from direct data
  if (data.data && Array.isArray(data.data) && data.data.length > 0) {
    sample.directData = data.data.slice(0, 2); // First 2 items
  }

  // Get fields
  if (data.table && data.table.fields) {
    sample.tableFields = data.table.fields;
  }

  if (data.fields) {
    sample.directFields = data.fields;
  }

  return sample;
}

async function analyzeAllReports() {
  console.log('🚀 Starting report data structure analysis...\n');

  const reports = await fetchReportsList();
  
  if (reports.length === 0) {
    console.log('❌ No reports found or failed to fetch reports list');
    return;
  }

  const analysisResults = [];

  // Fetch data for each report
  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    console.log(`\n📊 Processing report ${i + 1}/${reports.length}`);
    
    const result = await fetchReportData(report.uuid, report.name);
    analysisResults.push(result);
    
    // Add a small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Save results to file
  const outputPath = path.join(process.cwd(), 'report-structures-analysis.json');
  const analysis = {
    timestamp: new Date().toISOString(),
    totalReports: reports.length,
    successfulAnalyses: analysisResults.filter(r => !r.error).length,
    failedAnalyses: analysisResults.filter(r => r.error).length,
    results: analysisResults
  };

  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
  
  console.log('\n📊 Analysis Complete!');
  console.log(`✅ Successfully analyzed: ${analysis.successfulAnalyses} reports`);
  console.log(`❌ Failed to analyze: ${analysis.failedAnalyses} reports`);
  console.log(`💾 Results saved to: ${outputPath}`);

  // Generate summary
  generateSummary(analysis);
}

function generateSummary(analysis) {
  console.log('\n📋 STRUCTURE SUMMARY:');
  console.log('==================');

  const structures = {};
  const dataPatterns = {};

  analysis.results.forEach(result => {
    if (!result.error && result.structure) {
      const key = `${result.structure.hasTable ? 'table' : 'no-table'}-${result.structure.hasData ? 'data' : 'no-data'}-${result.structure.type || 'no-type'}`;
      
      if (!structures[key]) {
        structures[key] = {
          count: 0,
          examples: [],
          pattern: {
            hasTable: result.structure.hasTable,
            hasData: result.structure.hasData,
            hasFields: result.structure.hasFields,
            type: result.structure.type,
            tableType: result.structure.tableType
          }
        };
      }
      
      structures[key].count++;
      structures[key].examples.push(result.name);

      // Analyze data patterns
      if (result.structure.tableStructure && result.structure.tableStructure.sampleDataTypes) {
        Object.entries(result.structure.tableStructure.sampleDataTypes).forEach(([field, fieldInfo]) => {
          if (fieldInfo.hasDataProperty) {
            if (!dataPatterns[`${field}-nested`]) {
              dataPatterns[`${field}-nested`] = { count: 0, examples: [] };
            }
            dataPatterns[`${field}-nested`].count++;
            dataPatterns[`${field}-nested`].examples.push(result.name);
          }
        });
      }
    }
  });

  Object.entries(structures).forEach(([key, info]) => {
    console.log(`\n🏗️  Structure Pattern: ${key}`);
    console.log(`   Count: ${info.count}`);
    console.log(`   Has Table: ${info.pattern.hasTable}`);
    console.log(`   Has Data: ${info.pattern.hasData}`);
    console.log(`   Type: ${info.pattern.type || 'none'}`);
    console.log(`   Table Type: ${info.pattern.tableType || 'none'}`);
    console.log(`   Examples: ${info.examples.slice(0, 3).join(', ')}${info.examples.length > 3 ? '...' : ''}`);
  });

  if (Object.keys(dataPatterns).length > 0) {
    console.log('\n🎯 NESTED DATA PATTERNS:');
    Object.entries(dataPatterns).forEach(([pattern, info]) => {
      console.log(`   ${pattern}: ${info.count} reports (${info.examples.slice(0, 2).join(', ')})`);
    });
  }
}

// Run the analysis
analyzeAllReports().catch(console.error);