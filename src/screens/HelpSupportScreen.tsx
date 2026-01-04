import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types';

type HelpSupportScreenNavigationProp = StackNavigationProp<RootStackParamList, 'HelpSupport'>;

interface HelpSupportScreenProps {
  navigation: HelpSupportScreenNavigationProp;
}

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: 'Who receives my emergency alerts?',
    answer: 'Only the people in your Connections receive your emergency alerts. These are contacts you personally invite and approve. FamGuard does not send alerts to the public or to contacts outside your Connections.',
  },
  {
    question: 'What happens after I press the emergency button?',
    answer: 'An alert is sent immediately to your Connections with your location and time. The app then locks automatically and cannot be reopened from your device until a trusted connection confirms you are safe.',
  },
  {
    question: 'Can I stop or cancel an emergency alert?',
    answer: 'No. Once an emergency alert is triggered, it cannot be cancelled from your device. This prevents alerts from being stopped if your phone is taken or accessed by someone else.',
  },
  {
    question: 'Are incident reports anonymous?',
    answer: 'Yes. Incident reports can be submitted anonymously. Reports only include basic details to help nearby users stay informed and do not reveal your identity.',
  },
  {
    question: 'Does FamGuard work without internet access?',
    answer: 'FamGuard remains usable when mobile data is limited or network coverage is weak. Essential safety tools and maps stay available, though some features may require connectivity to update.',
  },
  {
    question: 'Why does FamGuard request location access?',
    answer: 'Location access, when enabled, is used to determine your location when you send an emergency alert to your Connections or report an incident. Location sharing only happens when you enable it.',
  },
  {
    question: 'Why are notifications required?',
    answer: 'Notifications allow you to receive safety alerts, incident updates, and messages from your Connections. Without notifications enabled, important alerts may be missed.',
  },
  {
    question: 'Does FamGuard track my location in the background?',
    answer: 'FamGuard does not track your location continuously. Location updates are shared only during emergency alerts, active location sharing, or when a feature requires it.',
  },
  {
    question: 'Can I change or revoke permissions later?',
    answer: 'Yes. You can manage location, notification, and other permissions at any time through the app settings or your device\'s system settings.',
  },
  {
    question: 'Will FamGuard access my contacts or personal files?',
    answer: 'FamGuard does not access your contacts, photos, or files unless you choose to add a contact to your Connections or submit information during an incident report.',
  },
];

const helpItems = [
  {
    id: 'faq',
    title: 'Frequently Asked Questions',
    icon: 'help-circle-outline',
    description: 'Common questions and answers',
  },
  {
    id: 'contact',
    title: 'Contact Support',
    icon: 'mail-outline',
    description: 'Get help from our support team',
  },
  {
    id: 'tutorial',
    title: 'App Tutorial',
    icon: 'play-circle-outline',
    description: 'Learn how to use the app',
  },
  {
    id: 'report',
    title: 'Report a Problem',
    icon: 'bug-outline',
    description: 'Report bugs or issues',
  },
];

export default function HelpSupportScreen({ navigation }: HelpSupportScreenProps) {
  const [showFAQ, setShowFAQ] = useState(false);
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);

  const handleItemPress = (id: string) => {
    switch (id) {
      case 'faq':
        setShowFAQ(true);
        break;
      case 'contact':
        Linking.openURL('mailto:info@acehubtechnologiesltd.co.uk');
        break;
      case 'report':
        Linking.openURL('mailto:support@acehubtechnologiesltd.co.uk');
        break;
      default:
        // Handle other cases
        break;
    }
  };

  const toggleFAQ = (index: number) => {
    setExpandedFAQ(expandedFAQ === index ? null : index);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.description}>
          Need help? Find answers to common questions or contact our support team.
        </Text>

        {helpItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.helpItem}
            onPress={() => handleItemPress(item.id)}
          >
            <Ionicons name={item.icon as any} size={24} color="#007AFF" />
            <View style={styles.helpItemContent}>
              <Text style={styles.helpItemTitle}>{item.title}</Text>
              <Text style={styles.helpItemDescription}>{item.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* FAQ Modal */}
      <Modal
        visible={showFAQ}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFAQ(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowFAQ(false);
                setExpandedFAQ(null);
              }}
              style={styles.modalBackButton}
            >
              <Ionicons name="arrow-back" size={24} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Frequently Asked Questions</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView 
            style={styles.faqContent} 
            contentContainerStyle={styles.faqScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {faqData.map((faq, index) => (
              <View key={index} style={styles.faqItem}>
                <TouchableOpacity
                  style={styles.faqQuestion}
                  onPress={() => toggleFAQ(index)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.faqQuestionText}>{faq.question}</Text>
                  <Ionicons
                    name={expandedFAQ === index ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#6366F1"
                  />
                </TouchableOpacity>
                {expandedFAQ === index && (
                  <View style={styles.faqAnswer}>
                    <Text style={styles.faqAnswerText}>{faq.answer}</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  description: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 24,
    lineHeight: 20,
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#F9F9F9',
  },
  helpItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  helpItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  helpItemDescription: {
    fontSize: 14,
    color: '#8E8E93',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalBackButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    flex: 1,
    textAlign: 'center',
    marginRight: 28,
  },
  faqContent: {
    flex: 1,
  },
  faqScrollContent: {
    padding: 20,
    paddingBottom: 24,
  },
  faqItem: {
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  faqQuestionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
    marginRight: 12,
    lineHeight: 22,
  },
  faqAnswer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  faqAnswerText: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 22,
    marginTop: 12,
  },
});

