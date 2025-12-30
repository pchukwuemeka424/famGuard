import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types';

type HelpSupportScreenNavigationProp = StackNavigationProp<RootStackParamList, 'HelpSupport'>;

interface HelpSupportScreenProps {
  navigation: HelpSupportScreenNavigationProp;
}

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
  const handleItemPress = (id: string) => {
    switch (id) {
      case 'contact':
        Linking.openURL('mailto:support@safezone.app');
        break;
      case 'report':
        Linking.openURL('mailto:bugs@safezone.app');
        break;
      default:
        // Handle other cases
        break;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
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
    padding: 16,
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
});

