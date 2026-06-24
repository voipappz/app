// Custom hook for LoginLeft component
export const useLoginLeft = () => {
  const currentYear = new Date().getFullYear();
  
  return {
    currentYear
  };
};
