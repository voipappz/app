// Centralized z-index layers for nested dialogs.
// Rule: each layer's MENU sits above its DIALOG but below the next layer.
//
// L1 (base): DIDDialog, IVR, standalone screens
// L2 (bridges): CallCondition, Announcement, VML, Queue, Extension, Bot
// L3 (leaf): SegmentDialog, Skill, Plan, Tariff, UserView

export const Z = {
  L1: { DIALOG: 1300, MENU: 1350 },
  L2: { DIALOG: 1400, BACKDROP: 1399, MENU: 1450 },
  L3: { DIALOG: 1500, BACKDROP: 1499, MENU: 1550 },
  // The one confirmation dialog: asked from any layer, so above all of them.
  CONFIRM: 1600,
};

// Helper: MUI Select MenuProps shorthand.
// Uses inline `style` on the Popover/Modal container (overrides MUI's CSS z-index)
// and `sx` on the Paper inside, so the dropdown stacks above parent dialogs.
export const menuProps = (layer) => ({
  style: { zIndex: layer.MENU },
  PaperProps: { sx: { zIndex: layer.MENU } },
});
