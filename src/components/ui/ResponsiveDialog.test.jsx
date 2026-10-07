import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResponsiveDialog from './ResponsiveDialog';
import { pretendPhoneScreen } from '../../test/phoneScreen';

let backToDesktop = () => {};
afterEach(() => backToDesktop());

const isFullScreen = () => screen.getByRole('dialog').className.includes('MuiDialog-paperFullScreen');

describe('ResponsiveDialog', () => {
  it('is a normal dialog on a desktop', () => {
    render(<ResponsiveDialog open>Body</ResponsiveDialog>);
    expect(isFullScreen()).toBe(false);
  });

  it('fills the screen on a phone', () => {
    backToDesktop = pretendPhoneScreen();
    render(<ResponsiveDialog open>Body</ResponsiveDialog>);
    expect(isFullScreen()).toBe(true);
  });

  it('lets an explicit fullScreen win', () => {
    backToDesktop = pretendPhoneScreen();
    render(<ResponsiveDialog open fullScreen={false}>Body</ResponsiveDialog>);
    expect(isFullScreen()).toBe(false);
  });
});
