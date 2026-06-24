export const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return '';
  
  const cleaned = cleanPhoneNumber(phoneNumber);
  
  if (cleaned.length >= 10) {
    const countryCode = cleaned.slice(0, -10);
    const areaCode = cleaned.slice(-10, -7);
    const middle = cleaned.slice(-7, -4);
    const last = cleaned.slice(-4);
    
    if (countryCode) {
      return `+${countryCode} ${areaCode}-${middle}-${last}`;
    } else {
      return `${areaCode}-${middle}-${last}`;
    }
  }
  
  return phoneNumber;
};

const cleanPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return '';
  
  let cleaned = phoneNumber.toString().replace(/\D/g, '');
  
  // Remove common internal prefixes (usually 2 digits at the start)
  // Check if number starts with typical internal prefixes like 00, 01, 02, etc.
  if (cleaned.length > 12) {
    // If number is very long, likely has internal prefix
    // Try removing first 2 digits if they look like internal routing
    const potentialPrefix = cleaned.substring(0, 2);
    if (['00', '01', '02', '03', '04', '05', '06', '07', '08', '09'].includes(potentialPrefix)) {
      const withoutPrefix = cleaned.substring(2);
      // Verify the remaining number looks like a valid international number
      if (withoutPrefix.length >= 10) {
        cleaned = withoutPrefix;
      }
    }
  }
  
  return cleaned;
};

export const extractCountryFromPhone = (phoneNumber) => {
  if (!phoneNumber) return { code: '', name: '', flag: '' };
  
  const cleaned = cleanPhoneNumber(phoneNumber);
  
  const countryMap = {
    '1': { code: 'US', name: 'United States', flag: '🇺🇸' },
    '23': { code: 'ML', name: 'Mali', flag: '🇲🇱' },
    '25': { code: 'RW', name: 'Rwanda', flag: '🇷🇼' },
    '92': { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
    '679': { code: 'FJ', name: 'Fiji', flag: '🇫🇯' },
    '44': { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
    '49': { code: 'DE', name: 'Germany', flag: '🇩🇪' },
    '33': { code: 'FR', name: 'France', flag: '🇫🇷' },
    '39': { code: 'IT', name: 'Italy', flag: '🇮🇹' },
    '34': { code: 'ES', name: 'Spain', flag: '🇪🇸' },
    '351': { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
    '31': { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
    '32': { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
    '41': { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
    '43': { code: 'AT', name: 'Austria', flag: '🇦🇹' },
    '45': { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
    '46': { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
    '47': { code: 'NO', name: 'Norway', flag: '🇳🇴' },
    '358': { code: 'FI', name: 'Finland', flag: '🇫🇮' },
    '48': { code: 'PL', name: 'Poland', flag: '🇵🇱' },
    '420': { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿' },
    '421': { code: 'SK', name: 'Slovakia', flag: '🇸🇰' },
    '36': { code: 'HU', name: 'Hungary', flag: '🇭🇺' },
    '40': { code: 'RO', name: 'Romania', flag: '🇷🇴' },
    '359': { code: 'BG', name: 'Bulgaria', flag: '🇧🇬' },
    '385': { code: 'HR', name: 'Croatia', flag: '🇭🇷' },
    '386': { code: 'SI', name: 'Slovenia', flag: '🇸🇮' },
    '372': { code: 'EE', name: 'Estonia', flag: '🇪🇪' },
    '371': { code: 'LV', name: 'Latvia', flag: '🇱🇻' },
    '370': { code: 'LT', name: 'Lithuania', flag: '🇱🇹' },
    '972': { code: 'IL', name: 'Israel', flag: '🇮🇱' },
    '86': { code: 'CN', name: 'China', flag: '🇨🇳' },
    '81': { code: 'JP', name: 'Japan', flag: '🇯🇵' },
    '82': { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
    '91': { code: 'IN', name: 'India', flag: '🇮🇳' },
    '55': { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
    '54': { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
    '52': { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
    '593': { code: 'EC', name: 'Ecuador', flag: '🇪🇨' },
    '57': { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
    '51': { code: 'PE', name: 'Peru', flag: '🇵🇪' },
    '56': { code: 'CL', name: 'Chile', flag: '🇨🇱' },
    '58': { code: 'VE', name: 'Venezuela', flag: '🇻🇪' },
    '507': { code: 'PA', name: 'Panama', flag: '🇵🇦' },
    '506': { code: 'CR', name: 'Costa Rica', flag: '🇨🇷' },
    '502': { code: 'GT', name: 'Guatemala', flag: '🇬🇹' },
    '504': { code: 'HN', name: 'Honduras', flag: '🇭🇳' },
    '503': { code: 'SV', name: 'El Salvador', flag: '🇸🇻' },
    '505': { code: 'NI', name: 'Nicaragua', flag: '🇳🇮' },
    '61': { code: 'AU', name: 'Australia', flag: '🇦🇺' },
    '64': { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
  };
  
  // Sort by longest code first to match longer codes before shorter ones
  const sortedEntries = Object.entries(countryMap).sort((a, b) => b[0].length - a[0].length);
  
  for (const [code, country] of sortedEntries) {
    if (cleaned.startsWith(code)) {
      return country;
    }
  }
  
  return { code: 'UN', name: 'Unknown', flag: '🏳️' };
};

export const formatDuration = (seconds) => {
  if (!seconds) return '00:00:00';
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};