import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types';

type TermsOfServiceScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TermsOfService'>;

interface TermsOfServiceScreenProps {
  navigation: TermsOfServiceScreenNavigationProp;
}

export default function TermsOfServiceScreen({ navigation }: TermsOfServiceScreenProps) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Last Updated: January 2025</Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
          <Text style={styles.text}>
            By accessing and using SafeZone, you accept and agree to be bound by the terms and 
            provision of this agreement.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Use License</Text>
          <Text style={styles.text}>
            Permission is granted to temporarily use SafeZone for personal, non-commercial use only. 
            This is the grant of a license, not a transfer of title.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. User Responsibilities</Text>
          <Text style={styles.text}>
            You are responsible for maintaining the confidentiality of your account and password. 
            You agree to use the service only for lawful purposes and in accordance with these terms.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Location Sharing</Text>
          <Text style={styles.text}>
            By using location sharing features, you consent to sharing your location with your 
            connections. You can disable location sharing at any time in settings.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Prohibited Uses</Text>
          <Text style={styles.text}>
            You may not use SafeZone to harass, abuse, or harm others, or to violate any laws. 
            False incident reports are strictly prohibited.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Limitation of Liability</Text>
          <Text style={styles.text}>
            SafeZone is provided "as is" without warranties. We are not liable for any damages 
            arising from your use of the service.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Changes to Terms</Text>
          <Text style={styles.text}>
            We reserve the right to modify these terms at any time. Continued use of the service 
            after changes constitutes acceptance of the new terms.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. Contact Information</Text>
          <Text style={styles.text}>
            For questions about these Terms of Service, please contact us at legal@safezone.app
          </Text>
        </View>
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  text: {
    fontSize: 14,
    color: '#000000',
    lineHeight: 22,
  },
});

