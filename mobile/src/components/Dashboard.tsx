import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { Icon } from './Icon';
import { Button } from './ui';

type MenuItem = { title: string; onPress: () => void };
export function Dashboard({ title, subtitle, invite, onOpen, disabled, menu, error, promotion }: {
  title: string; subtitle: string; invite?: ReactNode; onOpen: () => void; disabled?: boolean; menu: MenuItem[]; error?: string; promotion?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[st.page, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
        <View style={st.header}><Text style={st.brand}>Closer</Text><Pressable accessibilityRole="button" accessibilityLabel="Open menu" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={st.menuButton}><Icon name="menu" color={colors.text} /></Pressable></View>
        {invite ? <View style={st.invite}>{invite}</View> : null}
        <View style={st.content}><Text style={st.title}>{title}</Text><Text style={st.subtitle}>{subtitle}</Text><Button title="Open cards" onPress={onOpen} disabled={disabled} style={{ alignSelf: 'flex-start', minWidth: 180 }} />{error ? <Text accessibilityRole="alert" style={st.error}>{error}</Text> : null}</View>
        {promotion ? <View style={st.promotion}>{promotion}</View> : null}
      </ScrollView>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.overlay} accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setOpen(false)}>
          <View accessibilityViewIsModal style={[st.menu, { marginTop: insets.top + 68 }]}>
            <Button kind="link" title="Close menu" onPress={() => setOpen(false)} />
            {menu.map(item => <Button key={item.title} kind="link" title={item.title} onPress={() => { setOpen(false); item.onPress(); }} />)}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  page: { flexGrow: 1, paddingHorizontal: 24, width: '100%', maxWidth: 900, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  brand: { fontFamily: fonts.serifBold, fontSize: 24, color: colors.text },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  invite: { marginTop: 32, padding: 24, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: 16, gap: 14, maxWidth: 540 },
  content: { paddingTop: 64, paddingBottom: 32, gap: 16, maxWidth: 540 },
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 42, letterSpacing: -0.8, color: colors.text },
  subtitle: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 24, color: colors.muted, marginBottom: 12 },
  promotion: { maxWidth: 540, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 24, gap: 12 },
  error: { fontFamily: fonts.sans, fontSize: 14, color: colors.bad },
  overlay: { flex: 1, backgroundColor: '#0006', alignItems: 'flex-end', paddingHorizontal: 24 },
  menu: { padding: 12, minWidth: 220, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: 16 },
});
