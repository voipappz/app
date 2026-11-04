import { Box, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';

const ICONS = {
  completed: <CheckCircleIcon sx={{ fontSize: 16, color: 'var(--color-success, #16a34a)' }} />,
  in_progress: <TimelapseIcon sx={{ fontSize: 16, color: 'var(--accent-secondary, #EEA740)' }} />,
  cancelled: <CancelOutlinedIcon sx={{ fontSize: 16, color: 'var(--theme-text-tertiary)' }} />
};

/**
 * The bot's TODO list for this conversation.
 *
 * @param {{todos?: import('./contract').Todo[], labels?: Object}} props
 */
const TodoList = ({ todos = [], labels = {} }) => {
  const done = todos.filter((t) => t.status === 'completed').length;
  return (
    <Box data-testid="todo-list" sx={{ p: 2 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--theme-text-tertiary)', mb: 1 }}>
        {labels.todosTitle || 'Tasks'} {todos.length > 0 && `${done}/${todos.length}`}
      </Typography>
      {todos.length === 0 ? (
        <Typography sx={{ fontSize: '0.8rem', color: 'var(--theme-text-tertiary)' }}>{labels.noTodos || 'No tasks'}</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {todos.map((todo) => (
            <Box component="li" key={todo.id} data-testid="todo" data-status={todo.status} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              {ICONS[todo.status] || <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: 'var(--theme-text-tertiary)' }} />}
              <Typography
                sx={{
                  fontSize: '0.8rem',
                  color: 'var(--theme-text-primary)',
                  textDecoration: todo.status === 'completed' || todo.status === 'cancelled' ? 'line-through' : 'none'
                }}
              >
                {todo.content}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default TodoList;
