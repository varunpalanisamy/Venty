// app/(tabs)/chat.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import {
  scheduleLocalNotification,
  cancelAllNotifications,
} from "@/app/NotificationsManager";
import { useUserPrefs } from "../UserPrefsContext"; // adjust path if needed

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const notificationTimer = useRef<NodeJS.Timeout | null>(null);
  const flatListRef = useRef<FlatList<Message>>(null);

  const { prefs } = useUserPrefs();
  const persona = prefs.persona || "default";
  const band1 = prefs.band1 || "default_band1";
  const band2 = prefs.band2 || "default_band2";
  const band3 = prefs.band3 || "default_band3";
  const band4 = prefs.band4 || "default_band4";
  const band5 = prefs.band5 || "default_band5";

  console.log("ChatScreen params:", prefs);

  useEffect(() => {
    registerForPushNotificationsAsync();

    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const { body } = notification.request.content;
        if (body) {
          const botMessage: Message = {
            id: Date.now().toString(),
            sender: "bot",
            text: body,
          };
          setMessages((prev) => [...prev, botMessage]);
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }
    );

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const notifData = response.notification.request.content;
        const notifBody = notifData.body || "";
        setInput(notifBody);
        Alert.alert("Notification Clicked", notifBody);
      });

    return () => {
      subscription.remove();
      responseSubscription.remove();
      if (notificationTimer.current) {
        clearTimeout(notificationTimer.current);
      }
    };
  }, []);

  async function registerForPushNotificationsAsync() {
    if (Device.isDevice) {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        Alert.alert("Failed to get push token for notifications!");
        return;
      }
    } else {
      Alert.alert("Must use physical device for notifications");
    }
  }

  const sendMessage = async () => {
    if (!input.trim()) return;
    const messageToSend = input;
    setInput("");
    Keyboard.dismiss();

    // Cancel any pending notifications
    if (notificationTimer.current) {
      clearTimeout(notificationTimer.current);
      await cancelAllNotifications();
    }

    // Add user's message
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: messageToSend,
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const API_HOST = "10.0.0.97";
      console.log("🚀 About to POST to:", `http://${API_HOST}:8000/chat`);

      const response = await fetch(`http://${API_HOST}:8000/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_message: messageToSend,
          persona,
          band1,
          band2,
          band3,
          band4,
          band5
        }),
      });
      const data = await response.json();

      console.log("done");

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: data.bot_reply,
      };
      setMessages((prev) => [...prev, botMessage]);
      flatListRef.current?.scrollToEnd({ animated: true });

      // Sentiment-based delay for notifications
      const sentimentScore = data.sentiment?.sentiment_score;
      let additionalDelaySeconds = 0;
      if (sentimentScore !== undefined) {
        if (sentimentScore <= 4) {
          additionalDelaySeconds = 15; // Negative sentiment: total 30 sec delay
        } else if (sentimentScore >= 7) {
          additionalDelaySeconds = 60; // Positive sentiment: total 75 sec delay
        } else {
          additionalDelaySeconds = 0; // Medium sentiment: total 15 sec delay
        }
      }

      // Calculate total delay (base 15 sec + additional)
      const baseDelay = 15000;
      const totalDelay = baseDelay + additionalDelaySeconds * 1000;

      // Start the notification timer
      notificationTimer.current = setTimeout(async () => {
        console.log(
          "Scheduling notification after delay of",
          totalDelay / 1000,
          "seconds"
        );
        try {
          const threadId = data.thread_id || "";
          console.log("Fetching checkup message for notification...");

          const checkupResponse = await fetch(
            `http://10.0.0.97:8000/checkup?thread_id=${threadId}`
          );
          const checkupData = await checkupResponse.json();
          const checkupMessage =
            checkupData.checkup_message || "Venty: How are you feeling now?";

          console.log(
            "Scheduling notification with checkup message:",
            checkupMessage
          );
          await scheduleLocalNotification(0, checkupMessage);
        } catch (error) {
          console.error("Error fetching checkup message:", error);
          await scheduleLocalNotification(0, "Venty: How are you feeling now?");
        }
      }, totalDelay);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const renderItem = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageContainer,
        item.sender === "user" ? styles.userMessage : styles.botMessage,
      ]}
    >
      <Text style={styles.messageText}>{item.text}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatContainer}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.inputContainer}
      >
        <TextInput
          style={styles.textInput}
          placeholder="Vent :)"
          placeholderTextColor="#FFF1DE"
          value={input}
          onChangeText={setInput}
        />
        <TouchableOpacity
          onPress={sendMessage}
          style={styles.sendButton}
          disabled={!input.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF1DE",
  },
  chatContainer: {
    padding: 12,
    paddingBottom: 60,
  },
  messageContainer: {
    marginVertical: 5,
    maxWidth: "80%",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#1A1A1A",
    fontWeight: "bold",
  },
  botMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#1A1A1A",
    fontWeight: "bold",
  },
  messageText: {
    color: "#FFF1DE",
    fontSize: 16,
    fontWeight: "bold",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 15,
    backgroundColor: "#FFF1DE",
    borderTopWidth: 0,
    fontWeight: "bold",
  },
  textInput: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    color: "#FFF1DE",
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 10,
    fontWeight: "bold",
  },
  sendButton: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 25,
    paddingHorizontal: 20,
    height: 45,
  },
  sendButtonText: {
    color: "#FFF1DE",
    fontWeight: "bold",
  },
});
