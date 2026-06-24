/**
 * Report Data Structure Handler
 * 
 * This utility handles different report data structures dynamically
 * and provides a consistent interface for the Reports component.
 */

export class ReportDataHandler {
  constructor(reportData, rawDataArray = null) {
    this.rawData = reportData;
    this.rawDataArray = rawDataArray; // Allow passing data array separately
    this.structure = this.analyzeStructure(reportData, rawDataArray);
  }

  analyzeStructure(data) {
    if (!data) {
      return null;
    }

    const structure = {
      type: data.type || 'unknown',
      hasTable: !!data.table,
      hasDirectData: !!data.data,
      hasDirectFields: !!data.fields,
      dataLocation: null,
      fieldsLocation: null,
      dataArray: [],
      fieldsArray: []
    };



    // Determine where the actual data is located
    if (data.table && data.table.data && Array.isArray(data.table.data)) {
      structure.dataLocation = 'table.data';
      structure.dataArray = data.table.data;
    } else if (data.data && Array.isArray(data.data)) {
      structure.dataLocation = 'data';
      structure.dataArray = data.data;
    }

    // Determine where the fields definition is located
    if (data.table && data.table.fields && Array.isArray(data.table.fields)) {
      structure.fieldsLocation = 'table.fields';
      structure.fieldsArray = data.table.fields;
    } else if (data.fields && Array.isArray(data.fields)) {
      structure.fieldsLocation = 'fields';
      structure.fieldsArray = data.fields;
    }

    // Analyze data structure patterns
    if (structure.dataArray.length > 0) {
      const sampleRow = structure.dataArray[0];
      structure.fieldPatterns = this.analyzeFieldPatterns(sampleRow);
    }
    return structure;
  }

  analyzeFieldPatterns(sampleRow) {
    const patterns = {};
    
    Object.keys(sampleRow).forEach(key => {
      const value = sampleRow[key];
      patterns[key] = {
        type: typeof value,
        isNested: this.isNestedDataStructure(value),
        hasDataProperty: value && typeof value === 'object' && 'data' in value,
        hasColorProperty: value && typeof value === 'object' && 'color' in value,
        hasMethodProperty: value && typeof value === 'object' && 'method' in value,
        hasParamsProperty: value && typeof value === 'object' && 'params' in value,
        hasIconProperty: value && typeof value === 'object' && 'icon' in value,
        extractionMethod: this.getExtractionMethod(value)
      };
    });

    return patterns;
  }

  isNestedDataStructure(value) {
    return value && 
           typeof value === 'object' && 
           value !== null && 
           'data' in value;
  }

  getExtractionMethod(value) {
    if (this.isNestedDataStructure(value)) {
      return 'nested'; // Extract from .data property
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return 'direct'; // Use value directly
    } else if (value === null || value === undefined) {
      return 'empty'; // Handle empty values
    } else {
      return 'stringify'; // Convert to string
    }
  }

  /**
   * Get processed fields for column definitions
   */
  getFields() {
    const fields = [];

    // Priority 1: Use defined fields if available
    if (this.structure.fieldsArray.length > 0) {
      return this.structure.fieldsArray.map(field => ({
        key: field.field || field.key || field.name,
        name: field.name || this.generateHeaderName(field.field || field.key || field.name),
        type: field.type || 'string'
      }));
    }

    // Priority 2: Derive fields from data structure
    if (this.structure.fieldPatterns) {
      return Object.keys(this.structure.fieldPatterns).map(key => ({
        key: key,
        name: this.generateHeaderName(key),
        type: this.structure.fieldPatterns[key].type,
        pattern: this.structure.fieldPatterns[key]
      }));
    }

    return fields;
  }

  /**
   * Get processed rows for table display
   */
  getRows() {
    if (!this.structure.dataArray || this.structure.dataArray.length === 0) {
      return [];
    }

    const processedRows = this.structure.dataArray.map((row, index) => {
      const processedRow = { id: index };

      Object.keys(row).forEach(key => {
        const value = row[key];
        const pattern = this.structure.fieldPatterns?.[key];

        processedRow[key] = this.extractValue(value, pattern);
      });

      return processedRow;
    });


    
    return processedRows;
  }

  /**
   * Extract value based on the field pattern
   */
  extractValue(value, pattern) {
    if (!pattern) {
      // Fallback: try to detect structure on the fly
      if (this.isNestedDataStructure(value)) {
        return value.data;
      }
      return value;
    }

    switch (pattern.extractionMethod) {
      case 'nested':
        return value?.data ?? '';
      case 'direct':
        return value;
      case 'empty':
        return '';
      case 'stringify':
        return String(value);
      default:
        return value;
    }
  }

  /**
   * Generate a readable header name from a field key
   */
  generateHeaderName(key) {
    if (!key) return 'Unknown';
    
    return key
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space before capital letters
      .replace(/\b\w/g, char => char.toUpperCase()); // Capitalize first letter of each word
  }

  /**
   * Get summary information about the data structure
   */
  getSummary() {
    return {
      totalRows: this.structure.dataArray.length,
      totalFields: this.getFields().length,
      dataLocation: this.structure.dataLocation,
      fieldsLocation: this.structure.fieldsLocation,
      type: this.structure.type,
      hasNestedData: Object.values(this.structure.fieldPatterns || {})
        .some(pattern => pattern.isNested),
      fieldPatterns: this.structure.fieldPatterns
    };
  }

  /**
   * Static method to create handler from report data
   */
  static fromReportData(reportData) {
    return new ReportDataHandler(reportData);
  }
}

export default ReportDataHandler;