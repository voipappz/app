import { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { Typography, Chip, Box, Button } from '@mui/material';
import {
  FiberManualRecord as DotIcon,
  Campaign as AnnouncementIcon,
  MusicNote as MusicIcon,
} from '@mui/icons-material';
import PBXBaseNode, { TYPE_CONFIG } from './PBXBaseNode';

const formatStrategy = (s) =>
  s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

const getAgentStatusColor = (status) => {
  if (!status) return '#9e9e9e';
  const s = status.toLowerCase();
  if (s === 'available') return '#4caf50';
  if (s === 'on break') return '#ff9800';
  if (s === 'logged out') return '#9e9e9e';
  if (s.includes('on demand')) return '#2196f3';
  return '#9e9e9e';
};

const getStatusDotColor = (tier) => {
  if (tier.agent_status) return getAgentStatusColor(tier.agent_status);
  const state = (tier.agent_state || tier.state || '').toLowerCase();
  if (state === 'idle' || state === 'waiting' || state === 'ready') return '#4caf50';
  if (state === 'receiving') return '#ff9800';
  if (state.includes('queue call')) return '#f44336';
  return '#9e9e9e';
};

const VISIBLE_AGENTS = 5;

const QueueNode = memo(({ data, selected }) => {
  const [expanded, setExpanded] = useState(false);
  const tiers = data.tiers || [];
  const visibleTiers = expanded ? tiers : tiers.slice(0, VISIBLE_AGENTS);
  const hasTimeout = data.max_wait_time_bridge_type && data.max_wait_time_bridge_uuid;
  const hasIntroAnnouncement = !!(data.intro_announcement?.uuid || data.intro_announcement_uuid);
  const hasHoldAnnouncement = !!(data.hold_announcement?.uuid || data.hold_announcement_uuid);

  // Count right-side handles for positioning
  let rightHandleIndex = 0;

  return (
    <PBXBaseNode type="queue" width={370} selected={selected}>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
        {data.name || 'Unnamed Queue'}
      </Typography>

      {/* Stats chips */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
        {data.strategy && (
          <Chip label={formatStrategy(data.strategy)} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.65rem' }} />
        )}
        {data.max_wait_time && (
          <Chip label={`${data.max_wait_time}s wait`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.65rem' }} />
        )}
        <Chip label={`${tiers.length} agent${tiers.length !== 1 ? 's' : ''}`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.65rem' }} />
        <Chip
          label={data.enabled !== false ? 'On' : 'Off'}
          size="small"
          color={data.enabled !== false ? 'success' : 'default'}
          sx={{ height: 22, fontSize: '0.65rem' }}
        />
      </Box>

      {/* Announcement indicators */}
      {(hasIntroAnnouncement || hasHoldAnnouncement) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mb: 0.75 }}>
          {hasIntroAnnouncement && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AnnouncementIcon sx={{ fontSize: 12, color: '#0288d1' }} />
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#0288d1' }}>
                Intro Announcement
              </Typography>
            </Box>
          )}
          {hasHoldAnnouncement && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <MusicIcon sx={{ fontSize: 12, color: '#0288d1' }} />
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#0288d1' }}>
                Hold Music
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Agent list */}
      {tiers.length > 0 && (
        <>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.25, fontSize: '0.62rem' }}>
            Agents
          </Typography>
          {visibleTiers.map((tier) => {
            const dotColor = getStatusDotColor(tier);
            return (
              <Box key={tier.agent || tier.agent_name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
                <DotIcon sx={{ fontSize: 8, color: dotColor }} />
                <Typography variant="body2" noWrap sx={{ flex: 1, fontSize: '0.72rem' }}>
                  {tier.agent_name || (tier.agent && tier.agent.slice(0, 8))}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                  L{tier.level || 1} P{tier.position || 1}
                </Typography>
              </Box>
            );
          })}
          {tiers.length > VISIBLE_AGENTS && (
            <Button
              size="small"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              sx={{ textTransform: 'none', fontSize: '0.65rem', py: 0, minHeight: 20 }}
            >
              {expanded ? 'Show less' : `+${tiers.length - VISIBLE_AGENTS} more`}
            </Button>
          )}
        </>
      )}

      {/* Source handles: announcements (right side) */}
      {hasIntroAnnouncement && (
        <Handle
          type="source"
          position={Position.Right}
          id="intro-announcement"
          style={{
            width: 6,
            height: 6,
            background: '#0288d1',
            border: '2px solid #fff',
            top: `${72 + (rightHandleIndex++) * 22}px`,
            right: -3,
          }}
        />
      )}
      {hasHoldAnnouncement && (
        <Handle
          type="source"
          position={Position.Right}
          id="hold-announcement"
          style={{
            width: 6,
            height: 6,
            background: '#0288d1',
            border: '2px solid #fff',
            top: `${72 + rightHandleIndex * 22}px`,
            right: -3,
          }}
        />
      )}

      {/* Source handle: timeout (bottom) */}
      {hasTimeout && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="timeout"
          style={{
            width: 8,
            height: 8,
            background: '#9e9e9e',
            border: '2px solid #fff',
            bottom: -4,
          }}
        />
      )}
    </PBXBaseNode>
  );
});

QueueNode.displayName = 'QueueNode';

export default QueueNode;
