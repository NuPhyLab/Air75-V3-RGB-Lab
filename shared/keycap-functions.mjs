// Air75 V3 Mac keycap order. HID usages, not macOS virtual key codes.
// Generic Desktop / Consumer usages follow Apple's IOHIDUsageTables.h.
export const KEYCAP_USAGES = [
  0xc00000070, 0xc0000006f, // Display brightness down / up
  0xff0100000010, 0xc00000221, 0xc000000cf, 0x10000009b, // Mission Control, Spotlight, dictation, DND
  0xc000000b6, 0xc000000cd, 0xc000000b5, // Previous, play/pause, next
  0xc000000e2, 0xc000000ea, 0xc000000e9, // Mute, volume down / up
];
export const FACTORY_MAC_ROW = [105,106,32262,32263,32264,32278,172,174,171,168,170,169];
export function extendedKeycapMappings() {
  return KEYCAP_USAGES.map((target,i)=>({HIDKeyboardModifierMappingSrc:0x700000068+i,HIDKeyboardModifierMappingDst:target}));
}
