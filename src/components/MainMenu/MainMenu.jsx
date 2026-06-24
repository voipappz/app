import {
  Box,
  Button,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery
} from '@mui/material';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PhoneIcon from '@mui/icons-material/Phone';
import BarChartIcon from '@mui/icons-material/BarChart';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../../context/AuthContext';
import { useACL } from '../../hooks/useACL';
import { useDirection } from '../../context/DirectionContext';
import './MainMenu.css';
import { brand } from '../../config';

const MainMenu = ({ mobileDrawerOpen, onDrawerToggle }) => {
  const { t } = useTranslation();
  const { isAuthenticated, logout } = useAuth();
  const { can } = useACL();
  const { direction } = useDirection();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Define all menu items with their required permissions
  const allMenuItems = [
    { icon: <DashboardIcon />, text: t('menu.dashboard'), path: '/dashboard', permission: 'dashboard:read' },
    { icon: <PhoneIcon />, text: t('menu.calls'), path: '/calls', permission: 'calls:read' },
    { icon: <BarChartIcon />, text: t('menu.reports'), path: '/reports', permission: 'reports:read' },
    { icon: <MonitorHeartIcon />, text: t('menu.status'), path: '/status', permission: 'dashboard:read' },
  ];

  // Filter menu items based on user permissions
  const menuItems = allMenuItems.filter(item => can(item.permission));

  // Mobile drawer content
  const drawerContent = (
    <Box className="mobile-drawer-content">
      <Box className="mobile-logo-container">
        <img
          src={brand.logo}
          alt={brand.name}
          width="50"
          height="50"
        />
      </Box>
      <List>
        {menuItems.map((item, index) => (
          <ListItem key={index} disablePadding>
            <ListItemButton
              component={RouterLink}
              to={item.path}
              onClick={() => onDrawerToggle && onDrawerToggle()}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
        {/* Direction toggle - commented out
        <ListItem disablePadding>
          <ListItemButton onClick={toggleDirection}>
            <ListItemIcon><SwapHorizIcon /></ListItemIcon>
            <ListItemText primary={direction === 'rtl' ? t('menu.switchToLTR') : t('menu.switchToRTL')} />
          </ListItemButton>
        </ListItem>
        */}
        <ListItem disablePadding>
          <ListItemButton onClick={() => { handleLogout(); onDrawerToggle && onDrawerToggle(); }}>
            <ListItemIcon><LogoutIcon /></ListItemIcon>
            <ListItemText primary={t('menu.logout')} />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  // Mobile: render only the slide-out drawer — the hamburger lives in the Layout
  // header. The drawer portals to <body>, so it's safe to mount from the header.
  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileDrawerOpen}
        onClose={onDrawerToggle}
        anchor={direction == 'rtl' ? 'top' : 'left'}
        ModalProps={{ keepMounted: true }}
        className="mobile-drawer"
        PaperProps={{
          sx: {
            backgroundColor: '#000',
            color: '#fff',
            width: 250
          }
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  // Desktop: horizontal navigation that lives in the top bar (no sidebar).
  if (!isAuthenticated) return null;
  return (
    <Box component="nav" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {menuItems.map((item) => {
        const active = location.pathname === item.path;
        return (
          <Button
            key={item.path}
            component={RouterLink}
            to={item.path}
            startIcon={item.icon}
            disableRipple
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              px: 1.5,
              color: active ? 'primary.main' : 'text.secondary',
              bgcolor: active ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {item.text}
          </Button>
        );
      })}
    </Box>
  );
};

export default MainMenu;