import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react';
import PropTypes from 'prop-types';
import { TOURS, getAutoStartTours } from '../constants/tours';
import { useSessionRole } from '../hooks/useIsUserSession';

const TourContext = createContext();

const STORAGE_KEY = 'completedTours';

/**
 * TourProvider Component
 *
 * Manages tour state and provides tour controls to the application.
 * Tours are automatically triggered on first login if configured — for an
 * account (admin) only: the tours walk through admin screens a portal user
 * does not have.
 * Completed tours are stored in localStorage to prevent repeat showings.
 */
export const TourProvider = ({ children }) => {
  const [activeTour, setActiveTour] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const role = useSessionRole();

  // Load completed tours from localStorage
  const [completedTours, setCompletedTours] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Save completed tours to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completedTours));
    } catch (error) {
      console.error('Failed to save completed tours:', error);
    }
  }, [completedTours]);

  // Check for auto-start tours on initial load
  useEffect(() => {
    if (isInitialized || role !== 'admin') return;

    const autoStartTourIds = getAutoStartTours();
    for (const tourId of autoStartTourIds) {
      if (!completedTours[tourId]) {
        // Delay to allow page to render
        const timer = setTimeout(() => {
          setActiveTour(tourId);
          setCurrentStep(0);
        }, 1500);
        setIsInitialized(true);
        return () => clearTimeout(timer);
      }
    }
    setIsInitialized(true);
  }, [completedTours, isInitialized, role]);

  /**
   * Start a specific tour
   * @param {string} tourId - The tour ID to start
   * @param {boolean} force - Force start even if already completed
   */
  const startTour = useCallback((tourId, force = false) => {
    const tour = TOURS[tourId];
    if (!tour) {
      console.warn(`Tour "${tourId}" not found`);
      return;
    }

    if (!force && completedTours[tourId]) {
      console.log(`Tour "${tourId}" already completed`);
      return;
    }

    setActiveTour(tourId);
    setCurrentStep(0);
  }, [completedTours]);

  /**
   * Move to the next step in the current tour
   */
  const nextStep = useCallback(() => {
    if (!activeTour) return;

    const tour = TOURS[activeTour];
    if (!tour) return;

    if (currentStep < tour.steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Tour complete
      completeTour();
    }
  }, [activeTour, currentStep]);

  /**
   * Move to the previous step in the current tour
   */
  const prevStep = useCallback(() => {
    if (!activeTour) return;
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [activeTour, currentStep]);

  /**
   * Skip the current tour without marking it complete
   */
  const skipTour = useCallback(() => {
    setActiveTour(null);
    setCurrentStep(0);
  }, []);

  /**
   * Complete the current tour and mark it as done
   */
  const completeTour = useCallback(() => {
    if (activeTour) {
      setCompletedTours((prev) => ({
        ...prev,
        [activeTour]: {
          completedAt: new Date().toISOString(),
        },
      }));
    }
    setActiveTour(null);
    setCurrentStep(0);
  }, [activeTour]);

  /**
   * Reset a tour so it can be shown again
   * @param {string} tourId - The tour ID to reset
   */
  const resetTour = useCallback((tourId) => {
    setCompletedTours((prev) => {
      const newCompleted = { ...prev };
      delete newCompleted[tourId];
      return newCompleted;
    });
  }, []);

  /**
   * Reset all tours
   */
  const resetAllTours = useCallback(() => {
    setCompletedTours({});
  }, []);

  /**
   * Check if a tour has been completed
   * @param {string} tourId - The tour ID to check
   * @returns {boolean} True if the tour has been completed
   */
  const isTourCompleted = useCallback((tourId) => {
    return !!completedTours[tourId];
  }, [completedTours]);

  /**
   * Get the current tour object
   * @returns {object|null} The current tour or null
   */
  const getCurrentTour = useCallback(() => {
    if (!activeTour) return null;
    return TOURS[activeTour] || null;
  }, [activeTour]);

  /**
   * Get the current step object
   * @returns {object|null} The current step or null
   */
  const getCurrentStep = useCallback(() => {
    const tour = getCurrentTour();
    if (!tour) return null;
    return tour.steps[currentStep] || null;
  }, [getCurrentTour, currentStep]);

  const value = {
    // State
    activeTour,
    currentStep,
    completedTours,
    isInitialized,

    // Actions
    startTour,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
    resetTour,
    resetAllTours,

    // Helpers
    isTourCompleted,
    getCurrentTour,
    getCurrentStep,
    totalSteps: activeTour ? TOURS[activeTour]?.steps.length || 0 : 0,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  );
};

TourProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * Hook to access tour context
 * @returns {object} Tour context value
 */
export const useTour = () => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};

export default TourContext;
