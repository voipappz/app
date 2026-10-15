import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SoftphoneDownloadLinks from './SoftphoneDownloadLinks.jsx';

describe('SoftphoneDownloadLinks', () => {
  it('links to Cloud Softphone on Google Play and the App Store, in a new tab', () => {
    render(<SoftphoneDownloadLinks />);
    const play = screen.getByRole('link', { name: /google play/i });
    const apple = screen.getByRole('link', { name: /app store/i });
    expect(play).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=cz.acrobits.softphone.cloudphone');
    expect(apple).toHaveAttribute('href', 'https://apps.apple.com/us/app/cloud-softphone/id567475545');
    expect(play).toHaveAttribute('target', '_blank');
    expect(play).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
