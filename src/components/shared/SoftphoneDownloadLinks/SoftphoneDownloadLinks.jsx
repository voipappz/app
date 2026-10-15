import { Box, Button, Typography } from '@mui/material';
import AndroidIcon from '@mui/icons-material/Android';
import AppleIcon from '@mui/icons-material/Apple';
import { useTranslation } from 'react-i18next';

// The app a device QR code is scanned with: Acrobits Cloud Softphone.
export const SOFTPHONE_APP_LINKS = {
  android: 'https://play.google.com/store/apps/details?id=cz.acrobits.softphone.cloudphone',
  ios: 'https://apps.apple.com/us/app/cloud-softphone/id567475545',
};

// Shown under every device QR code: where to get the app that scans it.
export default function SoftphoneDownloadLinks() {
  const { t } = useTranslation('extensions');
  const link = { size: 'small', variant: 'outlined', target: '_blank', rel: 'noopener noreferrer', sx: { borderRadius: 999, textTransform: 'none' } };
  return (
    <Box data-testid="softphone-download-links" sx={{ mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
        {t('qr.getApp')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button {...link} href={SOFTPHONE_APP_LINKS.android} startIcon={<AndroidIcon />}>{t('qr.googlePlay')}</Button>
        <Button {...link} href={SOFTPHONE_APP_LINKS.ios} startIcon={<AppleIcon />}>{t('qr.appStore')}</Button>
      </Box>
    </Box>
  );
}
