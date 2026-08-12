import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import PageHeader from '../common/PageHeader';
import ReportsWorkspace from './ReportsWorkspace';

export default function UsageReports() {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1440, mx: 'auto', minWidth: 0 }}>
      <PageHeader title={t('menu.reports')} subtitle={t('usageReports.subtitle')} />
      <ReportsWorkspace />
    </Box>
  );
}
