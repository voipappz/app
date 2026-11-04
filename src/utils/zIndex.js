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
  // The phone drawer opens above any dialog: a call can be taken mid-edit,
  // and the form stays open underneath. Its own menus and tooltips sit just
  // above it (components/ui/PopupLayer).
  PHONE: 1650,
  PHONE_POPUP: 1660,
  // The call dock (incoming call, in-call bar, phone button): above everything,
  // the phone drawer included, so a ringing call is never hidden.
  CALL: 1700,
  CALL_POPUP: 1710,
};


// Helper: MUI Select MenuProps shorthand.
// Uses inline `style` on the Popover/Modal container (overrides MUI's CSS z-index)
// and `sx` on the Paper inside, so the dropdown stacks above parent dialogs.
export const menuProps = (layer) => ({
  style: { zIndex: layer.MENU },
  PaperProps: { sx: { zIndex: layer.MENU } },
});
