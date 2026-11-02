import { memo } from 'react';
import { Box, Button, Chip, IconButton, Skeleton, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { formatTime } from '@voipappz/chat-ui';

const HandlerBadge = ({ handler, labels }) => {
  const human = handler === 'human';
  return (
    <Chip
      size="small"
      data-testid="conversation-handler"
      data-handler={human ? 'human' : 'bot'}
      icon={human ? <PersonIcon sx={{ fontSize: 14 }} /> : <SmartToyIcon sx={{ fontSize: 14 }} />}
      label={human ? (labels.human || 'Human') : (labels.bot || 'Bot')}
      sx={{
        height: 20,
        fontSize: '0.65rem',
        backgroundColor: human ? 'var(--color-warning, #f59e0b)' : 'var(--theme-bg-secondary)',
        color: human ? '#fff' : 'var(--theme-text-secondary)',
        '& .MuiChip-icon': { color: 'inherit' }
      }}
    />
  );
};

const Row = memo(({ conversation, selected, onSelect, onDelete, labels, formatTimestamp }) => (
  <Box
    role="button"
    tabIndex={0}
    aria-current={selected ? 'true' : undefined}
    data-testid="conversation-row"
    onClick={() => onSelect?.(conversation.id)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(conversation.id); }
    }}
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1,
      p: 1.5,
      borderRadius: '8px',
      cursor: 'pointer',
      backgroundColor: selected ? 'var(--theme-bg-secondary)' : 'transparent',
      '&:hover': { backgroundColor: 'var(--theme-hover)' },
      '&:hover .va-conv-delete, &:focus-within .va-conv-delete': { opacity: 1 }
    }}
  >
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography
        noWrap
        sx={{ fontSize: '0.85rem', color: 'var(--theme-text-primary)', fontWeight: selected ? 600 : 400 }}
      >
        {conversation.title || labels.untitled || 'New conversation'}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
        <HandlerBadge handler={conversation.handler} labels={labels} />
        <Typography data-testid="conversation-updated" sx={{ fontSize: '0.65rem', color: 'var(--theme-text-tertiary)' }}>
          {formatTimestamp(conversation.updated_at || conversation.inserted_at)}
        </Typography>
      </Box>
    </Box>
    {onDelete && (
      <IconButton
        size="small"
        className="va-conv-delete"
        aria-label={labels.delete || 'Delete conversation'}
        onClick={(e) => { e.stopPropagation(); onDelete(conversation.id); }}
        sx={{ opacity: 0, color: 'var(--theme-text-tertiary)' }}
      >
        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
      </IconButton>
    )}
  </Box>
));
Row.displayName = 'ConversationRow';

/**
 * The bots' conversations, newest first: title, who handles it (bot or
 * human) and when it last changed.
 *
 * @param {import('./contract').ConversationListProps} props
 */
const ConversationList = ({
  conversations = [],
  selectedId,
  loading = false,
  hasMore = false,
  onSelect,
  onNew,
  onDelete,
  onLoadMore,
  formatTimestamp = formatTime,
  labels = {}
}) => (
  <Box
    data-testid="conversation-list"
    sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      borderInlineEnd: '1px solid var(--theme-border)',
      backgroundColor: 'var(--theme-bg-primary)'
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2 }}>
      <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--theme-text-primary)' }}>
        {labels.title || 'Conversations'}
      </Typography>
      {onNew && (
        <Button size="small" startIcon={<AddIcon />} onClick={onNew} sx={{ textTransform: 'none' }}>
          {labels.new || 'New'}
        </Button>
      )}
    </Box>
    <Box sx={{ flex: 1, overflow: 'auto', px: 1, pb: 1 }}>
      {conversations.map((c) => (
        <Row
          key={c.id}
          conversation={c}
          selected={c.id === selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
          labels={labels}
          formatTimestamp={formatTimestamp}
        />
      ))}
      {loading && [0, 1, 2].map((i) => <Skeleton key={i} height={52} data-testid="conversation-skeleton" />)}
      {!loading && conversations.length === 0 && (
        <Typography sx={{ p: 2, fontSize: '0.8rem', color: 'var(--theme-text-tertiary)', textAlign: 'center' }}>
          {labels.empty || 'No conversations yet'}
        </Typography>
      )}
      {hasMore && !loading && onLoadMore && (
        <Button fullWidth size="small" onClick={onLoadMore} sx={{ textTransform: 'none', mt: 1 }}>
          {labels.loadMore || 'Load more'}
        </Button>
      )}
    </Box>
  </Box>
);

export default ConversationList;
