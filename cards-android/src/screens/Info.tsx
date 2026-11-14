import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { TopBar } from '../components/TopBar';
import { HeartBadge } from '../components/ui';
import { sheet, useK, useScaled } from '../scale';

export const CONTACT = 'hozaiphaa@gmail.com';
export const POLICY_DATE = 'November 14, 2026';

// The privacy policy is part of the app so it can be read with no connection.
// docs/privacy-policy.md is the same text for the Play Store listing.
const PRIVACY: [string, string][] = [
  ['The short version', 'Moth & Lamp works entirely on your phone. It has no accounts, no ads and no analytics, and it never connects to the internet. We do not collect, store or share any information about you.'],
  ['Who we are', 'Moth & Lamp is made and published by Huzaifa, an independent developer. "We" in this policy means the developer.'],
  ['What stays on your phone', 'The app remembers which cards you have seen, your favorites, your place in each set of decks and your settings. This is saved only in the app\'s private storage on this device. It is never sent to us or to anyone else, and we cannot see it.'],
  ['Permissions', 'The app does not ask for internet access, location, contacts, camera, microphone, photos or notifications. It can make the phone vibrate lightly when you tap, which you can switch off in the menu.'],
  ['Sharing a question', 'If you tap Share, the text of that question is handed to the app you choose (for example your messaging app). That app, not Moth & Lamp, sends it, and its own privacy policy applies.'],
  ['Deleting your data', 'Use "Reset my progress" in the menu to clear seen cards and saved places, and remove favorites from the Favorites screen. Uninstalling the app, or clearing its storage in Android settings, removes everything. If your phone backs up app data to your Google account, Android handles that backup under your Google settings.'],
  ['Age', 'Moth & Lamp is meant for adults aged 18 and over. Some decks include questions about intimacy and relationships.'],
  ['Changes', 'If this policy changes, the new version will ship with an app update and the date below will change.'],
  ['Contact', 'Questions about privacy:'],
];

const ABOUT: [string, string][] = [
  ['Moth & Lamp', 'Deep and playful question cards for couples. Share one phone, pick the decks you like, turn a card, and talk.'],
  ['How it works', 'Choose one deck, a few, or all of them. Swipe or tap Next for another card. Tap the heart to keep a card in your favorites. Your place in every set of decks is saved, so you can always pick up where you left off.'],
  ['Offline, always', 'Every question is inside the app. Nothing is downloaded and nothing is uploaded.'],
  ['For adults', 'The app is intended for people aged 18 and over. Some decks, such as Desire & Intimacy, ask about intimacy. You choose which decks to play.'],
  ['Contact', 'Questions or ideas:'],
];

export function Info({ page, version, onBack }: { page: 'privacy' | 'about'; version: string; onBack: () => void }) {
  const st = useScaled(base);
  const k = useK();
  const insets = useSafeAreaInsets();
  const sections = page === 'privacy' ? PRIVACY : ABOUT;
  return (
    <View style={[st.fill, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <TopBar title={page === 'privacy' ? 'Privacy policy' : 'About'} onBack={onBack} maxWidth={640} />
      <ScrollView style={st.scroll} contentContainerStyle={{ paddingHorizontal: 20 * k, paddingTop: 8 * k, paddingBottom: insets.bottom + 32 * k }}>
        {page === 'about' ? <View style={st.badge}><HeartBadge size={64} /></View> : null}
        {sections.map(([title, body]) => (
          <View key={title} style={{ marginBottom: 22 * k }}>
            <Text style={st.h} accessibilityRole="header">{title}</Text>
            <Text style={st.p} selectable>{body}</Text>
            {title === 'Contact' ? (
              // Opens the phone's mail app; the app itself still sends nothing.
              <Text style={[st.p, st.mail]} accessibilityRole="link" onPress={() => { Linking.openURL(`mailto:${CONTACT}`).catch(() => {}); }}>{CONTACT}</Text>
            ) : null}
          </View>
        ))}
        <Text style={st.foot}>{page === 'privacy' ? `Last updated ${POLICY_DATE}` : `Version ${version}`}</Text>
      </ScrollView>
    </View>
  );
}

const base = sheet({
  fill: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  h: { fontFamily: fonts.serifBold, fontSize: 19, color: colors.text, marginBottom: 6 },
  p: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 23, color: colors.soft },
  mail: { color: colors.accent2, textDecorationLine: 'underline', paddingVertical: 6 },
  badge: { alignItems: 'center', paddingTop: 8, paddingBottom: 22 },
  foot: { fontFamily: fonts.sans, fontSize: 13, color: colors.faint },
});
