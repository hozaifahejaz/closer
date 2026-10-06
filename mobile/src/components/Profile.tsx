import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Account, api } from '../api';
import { setItem } from '../storage';
import { colors, fonts } from '../theme';
import { Button, Field } from './ui';

type Props = { visible: boolean; token: string | null; name: string; onClose: () => void; onSaved?: (account: Account) => void; renameGuest?: (name: string) => Promise<unknown>; onNotice?: (message: string) => void };
export function Profile({ visible, token, name, onClose, onSaved, renameGuest, onNotice }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(name);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const latestName = useRef(name);
  useEffect(() => { latestName.current = name; }, [name]);
  useEffect(() => {
    const current = ++request.current;
    setDraft(latestName.current); setEmail(''); setError(''); setBusy(false);
    setLoading(visible && !!token);
    if (visible && token) api<Account>('/api/me', token).then(account => {
      if (request.current !== current) return;
      setDraft(account.name); setEmail(account.email || '');
    }).catch(e => { if (request.current === current) setError(e instanceof Error ? e.message : 'Could not load your profile.'); })
      .finally(() => { if (request.current === current) setLoading(false); });
    return () => { request.current = current + 1; };
  }, [visible, token]);
  const save = async () => {
    const clean = draft.trim();
    if (!clean || Array.from(clean).length > 24 || /[\u0000-\u001f\u007f-\u009f]/.test(clean)) { setError('Use a name between 1 and 24 characters, without line breaks.'); return; }
    const current = request.current;
    setBusy(true); setError('');
    try {
      const updated = token ? await api<Account>('/api/profile', token, { name: clean }) : null;
      if (!token) { if (!renameGuest) throw new Error('Reconnect before changing your name.'); await renameGuest(clean); }
      if (request.current !== current) return;
      await setItem('closer:name', clean);
      if (request.current !== current) return;
      if (updated) onSaved?.(updated);
      onNotice?.(updated?.liveRefreshPending ? 'Name saved. Your partner will see it after reconnecting.' : 'Name updated.');
      onClose();
    } catch (e) { if (request.current === current) setError(e instanceof Error ? e.message : 'Could not save your name.'); }
    finally { if (request.current === current) setBusy(false); }
  };
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[st.page, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
        <View style={st.header}><Text style={st.title}>Profile</Text><Button kind="ghost" title="" icon="close" accessibilityLabel="Close profile" onPress={onClose} /></View>
        <Text style={st.note}>{token ? 'Your partner will see your updated name.' : 'Your name is saved for this guest room.'}</Text>
        {loading ? <ActivityIndicator color={colors.accent} /> : <>
          <Field label="Display name" value={draft} onChangeText={setDraft} maxLength={48} editable={!busy} autoCapitalize="words" returnKeyType="done" onSubmitEditing={() => { if (!busy) void save(); }} />
          <Text style={st.note}>Use up to 24 characters.</Text>
          {token ? <Field label="Email" value={email} editable={false} autoCapitalize="none" accessibilityLabel="Email, read only" /> : null}
          <Button title="Save changes" onPress={() => { void save(); }} busy={busy} />
        </>}
        {error ? <Text accessibilityRole="alert" style={st.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg }, page: { flexGrow: 1, paddingHorizontal: 24, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: fonts.serif, color: colors.text, fontSize: 30 }, note: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14, lineHeight: 23 },
  error: { fontFamily: fonts.sans, color: colors.bad, fontSize: 14, lineHeight: 23 },
});
