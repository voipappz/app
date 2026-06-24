import { jwtDecode } from 'jwt-decode';

export const getAccountUuidFromToken = (accessToken) => {
  try {
    if (!accessToken) return null;
    
    const decoded = jwtDecode(accessToken);
    return decoded.uuid || null;
  } catch (error) {
    console.error('Error decoding JWT token:', error);
    return null;
  }
};

export const isTokenExpired = (token) => {
  try {
    if (!token) return true;
    
    const decoded = jwtDecode(token);
    const currentTime = Date.now() / 1000;
    
    return decoded.exp < currentTime;
  } catch (error) {
    console.error('Error checking token expiration:', error);
    return true;
  }
};