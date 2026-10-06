import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RoomState, SafetyAction } from '../api';
import { WEBSITE } from '../config';
import { colors, fonts } from '../theme';
import { Button } from './ui';

const reasons = ['Harassment or threats', 'Sexual or inappropriate content', 'Hate or discrimination', 'Child safety', 'Spam or impersonation', 'Other'];
export function Safety({ mode, room, request, onClose }: {
  mode: 'terms' | 'report' | null; room: RoomState;
  request: (action: SafetyAction) => Promise<{ reportId?: string }>; onClose: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [partnerHandle, setPartnerHandle] = useState<string | null>(null);
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState('');
  const [attachment, setAttachment] = useState<{ cardKey: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!mode) return;
    setPartnerHandle(room.partnerSafetyHandle);
    setChecked(false); setDetails(''); setError(''); setStatus(''); setReason(reasons[0]);
    const answer = room.reportablePartnerAnswer;
    setAttachment(typeof answer === 'string' ? { cardKey: room.card.id, text: answer } : null);
    // Snapshot the explicitly selected answer, even if the partner moves cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const run = async (action: SafetyAction) => {
    setBusy(true); setError('');
    try {
      const result = await request(action);
      if (action.type === 'reportUser') { setStatus(`Report received. Reference: ${result.reportId}. You can also block your partner below.`); setChecked(false); setDetails(''); }
      else onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Please try again.'); }
    finally { setBusy(false); }
  };
  const toggle = (label: string) => <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled: busy }} disabled={busy} onPress={() => setChecked(!checked)} style={st.check}><Text style={st.text}>{checked ? '☑' : '☐'} {label}</Text></Pressable>;
  return <Modal visible={mode !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={st.overlay}><View accessibilityViewIsModal style={st.panel}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={st.content}>
      <Text style={st.title}>{mode === 'terms' ? 'Before sharing an answer' : 'Safety & support'}</Text>
      {mode === 'terms' ? <>
        <Text style={st.text}>Closer is for adults aged 18 or older. Respect consent. No harassment, threats, hate, sexually explicit content, child exploitation, or illegal activity.</Text>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled: busy }} disabled={busy} onPress={() => setChecked(!checked)} style={st.check}><Text style={st.text}>{checked ? '☑' : '☐'} I have read and agree to the <Text style={{ color: colors.accent, textDecorationLine: 'underline' }} accessibilityRole="link" onPress={e => { e.stopPropagation(); void Linking.openURL(`${WEBSITE}/terms`); }}>Terms of Use &amp; Community Rules</Text> and <Text style={{ color: colors.accent, textDecorationLine: 'underline' }} accessibilityRole="link" onPress={e => { e.stopPropagation(); void Linking.openURL(`${WEBSITE}/privacy`); }}>Privacy Policy</Text>.</Text></Pressable>
        <Button title="Accept terms" disabled={!checked || busy} busy={busy} onPress={() => { void run({ type: 'acceptTerms', version: room.termsVersion }); }} />
        <Text style={st.note}>Your draft stays here. Submit your answer after accepting.</Text>
      </> : <>
        <Text style={st.text}>You choose what to share. Other private answers are not included. If you are in immediate danger, contact local emergency services.</Text>
        <Text style={st.text}>Report reason</Text>
        {reasons.map(value => <Pressable key={value} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: value === reason }} onPress={() => setReason(value)} style={st.check}><Text style={st.text}>{value === reason ? '●' : '○'} {value}</Text></Pressable>)}
        <TextInput multiline maxLength={1000} editable={!busy} accessibilityLabel="Report details (optional)" placeholder="Explain what happened (optional). Include only what reviewers should see." placeholderTextColor={colors.muted} value={details} onChangeText={setDetails} style={st.input} />
        {attachment ? <><Text selectable style={st.excerpt}>{attachment.text}</Text>{toggle('Share the revealed partner answer with reviewers')}</> : null}
        <Button title="Submit report" disabled={!room.canReportPartner || busy} busy={busy} onPress={() => { void run({ type: 'reportUser', partnerHandle, reason, details, includeAnswer: checked && !!attachment, answerText: attachment?.text ?? null, cardKey: attachment?.cardKey || null }); }} />
        {status ? <Text selectable accessibilityLiveRegion="polite" style={st.text}>{status}</Text> : null}
        <Button kind="ghost" title="Block partner" disabled={!room.canReportPartner || busy} onPress={() => Alert.alert('Block partner?', room.couple ? 'This unlinks you and prevents these accounts from linking again.' : 'This ends the room and blocks these saved guest identities for up to a year. Clearing storage or using another device creates a different identity.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Block partner', style: 'destructive', onPress: () => { void run({ type: 'blockUser', partnerHandle }); } }])} />
        {!room.canReportPartner ? <Text style={st.note}>You can report or block after a partner joins.</Text> : null}
        <Button kind="link" title="Terms & community rules" onPress={() => { Linking.openURL(`${WEBSITE}/terms`); }} />
        <Button kind="link" title="Contact support / appeal" onPress={() => { Linking.openURL('mailto:hozaiphaa@gmail.com'); }} />
      </>}
      {error ? <Text accessibilityRole="alert" style={st.error}>{error}</Text> : null}
      <Button kind="ghost" title="Close" disabled={busy} onPress={onClose} />
    </ScrollView></View></View>
  </Modal>;
}
const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 },
  panel: { maxHeight: '90%', width: '100%', maxWidth: 540, alignSelf: 'center', backgroundColor: colors.bg2, borderRadius: 18 },
  content: { padding: 24, gap: 12 },
  title: { fontFamily: fonts.serif, fontSize: 26, color: colors.text },
  text: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.text },
  note: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 19, color: colors.muted },
  check: { paddingVertical: 10 },
  input: { minHeight: 100, textAlignVertical: 'top', padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, fontFamily: fonts.sans, fontSize: 16, color: colors.text },
  excerpt: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.text, padding: 12, backgroundColor: colors.bg, borderRadius: 12 },
  error: { fontFamily: fonts.sans, fontSize: 14, color: colors.bad },
});
