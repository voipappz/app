import React, { useEffect, useState, useCallback } from 'react';
import { Box, Paper, Typography, Button, IconButton, LinearProgress } from '@mui/material';
import { Close as CloseIcon, ArrowBack, ArrowForward } from '@mui/icons-material';
import { useTour } from '../../context/TourContext';

/**
 * TourOverlay Component
 *
 * Displays the tour spotlight overlay and step tooltips.
 * Highlights target elements and shows step descriptions.
 */
const TourOverlay = () => {
  const {
    activeTour,
    currentStep,
    totalSteps,
    getCurrentTour,
    getCurrentStep,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
  } = useTour();

  const [targetRect, setTargetRect] = useState(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const tour = getCurrentTour();
  const step = getCurrentStep();

  // Find and highlight the target element
  const updateTargetPosition = useCallback(() => {
    if (!step) return;

    const element = document.querySelector(step.selector);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);

      // Calculate tooltip position
      const padding = 16;
      let top;
      let left;

      switch (step.position) {
        case 'top':
          top = rect.top - padding - 180; // Tooltip height estimate
          left = rect.left + rect.width / 2 - 160; // Center
          break;
        case 'bottom':
          top = rect.bottom + padding;
          left = rect.left + rect.width / 2 - 160;
          break;
        case 'left':
          top = rect.top + rect.height / 2 - 90;
          left = rect.left - padding - 340;
          break;
        case 'right':
          top = rect.top + rect.height / 2 - 90;
          left = rect.right + padding;
          break;
        case 'center':
        default:
          top = window.innerHeight / 2 - 90;
          left = window.innerWidth / 2 - 160;
          break;
      }

      // Keep tooltip in viewport
      left = Math.max(16, Math.min(left, window.innerWidth - 340));
      top = Math.max(16, Math.min(top, window.innerHeight - 200));

      setPosition({ top, left });
    } else if (step.optional) {
      // Element not found but step is optional, move to next
      nextStep();
    } else {
      // Element not found, center tooltip
      setTargetRect(null);
      setPosition({
        top: window.innerHeight / 2 - 90,
        left: window.innerWidth / 2 - 160,
      });
    }
  }, [step, nextStep]);

  useEffect(() => {
    updateTargetPosition();

    // Update position on resize/scroll
    const handleResize = () => updateTargetPosition();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [updateTargetPosition]);

  if (!activeTour || !tour || !step) {
    return null;
  }

  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <>
      {/* Dark overlay */}
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
          pointerEvents: 'auto',
        }}
        onClick={skipTour}
      />

      {/* Spotlight cutout */}
      {targetRect && (
        <Box
          sx={{
            position: 'fixed',
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            borderRadius: 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            pointerEvents: 'none',
            transition: 'all 0.3s ease',
          }}
        />
      )}

      {/* Tooltip */}
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: 320,
          zIndex: 10000,
          p: 2,
          borderRadius: 2,
          animation: 'fadeIn 0.3s ease',
          '@keyframes fadeIn': {
            from: { opacity: 0, transform: 'translateY(10px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Typography variant="subtitle1" fontWeight="bold">
            {step.title}
          </Typography>
          <IconButton
            size="small"
            onClick={skipTour}
            sx={{ ml: 1, mt: -0.5, mr: -0.5 }}
            aria-label="Close tour"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Description */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {step.description}
        </Typography>

        {/* Progress */}
        <Box sx={{ mb: 2 }}>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 4, borderRadius: 2 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Step {currentStep + 1} of {totalSteps}
          </Typography>
        </Box>

        {/* Navigation */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            size="small"
            onClick={skipTour}
            sx={{ textTransform: 'none' }}
          >
            Skip Tour
          </Button>

          <Box sx={{ display: 'flex', gap: 1 }}>
            {!isFirstStep && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<ArrowBack />}
                onClick={prevStep}
                sx={{ textTransform: 'none' }}
              >
                Back
              </Button>
            )}
            <Button
              size="small"
              variant="contained"
              endIcon={!isLastStep && <ArrowForward />}
              onClick={isLastStep ? completeTour : nextStep}
              sx={{ textTransform: 'none' }}
            >
              {isLastStep ? 'Finish' : 'Next'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </>
  );
};

export default TourOverlay;
