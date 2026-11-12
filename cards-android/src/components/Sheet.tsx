import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { Button, tap, Toggle } from './ui';

export type MenuItem = { title: string; onPress: () => void } | { title: string; on: boolean; onChange: (on: boolean) => void };

// The drop-down menu behind the ☰ button.
export function Menu({ visible, items, onClose }: { visible: boolean; items: MenuItem[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={st.menuOverlay} accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose}>
        <Pressable accessibilityViewIsModal style={[st.menu, { marginTop: insets.top + 64, marginRight: insets.right + 16 }]} onPress={() => {}}>
          {items.map(item => 'on' in item ? (
            <View key={item.title} style={st.menuRow}>
              <Text style={st.menuText}>{item.title}</Text>
              <Toggle on={item.on} onChange={item.onChange} label={item.title} />
            </View>
          ) : (
            <Pressable key={item.title} accessibilityRole="button" onPress={() => { tap(); onClose(); item.onPress(); }}
              style={({ pressed }) => [st.menuRow, pressed && { backgroundColor: colors.raise }]}>
              <Text style={st.menuText}>{item.title}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// A yes/no question before anything that can't be undone.
export function Confirm({ visible, title, body, yes, onYes, onClose, children }:
  { visible: boolean; title: string; body: string; yes: string; onYes: () => void; onClose: () => void; children?: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={st.overlay} accessibilityLabel="Cancel" onPress={onClose}>
        <Pressable accessibilityViewIsModal style={st.box} onPress={() => {}}>
          <Text style={st.title} accessibilityRole="header">{title}</Text>
          <Text style={st.body}>{body}</Text>
          {children}
          <View style={st.buttons}>
            <Button kind="ghost" title="Cancel" onPress={onClose} style={st.button} />
            <Button title={yes} onPress={() => { onClose(); onYes(); }} style={st.button} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  menuOverlay: { flex: 1, backgroundColor: '#0008', alignItems: 'flex-end' },
  menu: { paddingVertical: 8, minWidth: 250, maxWidth: 320, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden' },
  menuRow: { minHeight: 50, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  menuText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.text, flexShrink: 1 },
  overlay: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 20 },
  box: { width: '100%', maxWidth: 400, padding: 20, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: 20, gap: 10 },
  title: { fontFamily: fonts.serifBold, fontSize: 22, color: colors.text },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.soft },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  button: { flex: 1, paddingHorizontal: 6 },
});
