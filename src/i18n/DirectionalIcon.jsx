import { useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

/**
 * Arrows that mean "forward" and "back" rather than "right" and "left".
 *
 * A glyph pointing right means *onward* in English and *backward* in Hebrew,
 * so navigation arrows have to swap with the reading direction while other
 * arrows must not. The distinction is semantic and invisible in the icon name,
 * which is why it belongs at the call site:
 *
 *   <ChevronForward />   next page, drill in, advance a wizard   — swaps
 *   <ArrowBack />        return to the list, close a detail pane — swaps
 *   <PlayArrow />        play, skip track, fast-forward          — NEVER swaps
 *
 * The hard case is a mover between two lists (common/TransferList): its
 * buttons mean "send to the other list". Under RTL the other list is on the
 * opposite side, so the arrow has to flip *and* keep pointing at the same
 * list. Using these components makes that automatic; hardcoding
 * KeyboardArrowRight gets it backwards in Hebrew.
 *
 * Direction is read from the MUI theme rather than from the locale context, so
 * these also behave correctly inside an LtrIsland, which re-declares direction
 * for its subtree.
 */
const useIsRtl = () => useTheme().direction === 'rtl';

export const ChevronForward = (props) => {
  const Icon = useIsRtl() ? ChevronLeftIcon : ChevronRightIcon;
  return <Icon {...props} />;
};

export const ChevronBack = (props) => {
  const Icon = useIsRtl() ? ChevronRightIcon : ChevronLeftIcon;
  return <Icon {...props} />;
};

export const ArrowForward = (props) => {
  const Icon = useIsRtl() ? ArrowBackIcon : ArrowForwardIcon;
  return <Icon {...props} />;
};

export const ArrowBack = (props) => {
  const Icon = useIsRtl() ? ArrowForwardIcon : ArrowBackIcon;
  return <Icon {...props} />;
};
