import UIKit
import Capacitor
import Firebase
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Initialiser Firebase
        FirebaseApp.configure()
        
        // Configurer Firebase Messaging delegate
        Messaging.messaging().delegate = self
        
        // Configurer les notifications
        UNUserNotificationCenter.current().delegate = self
        application.registerForRemoteNotifications()
        
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
    
    // MARK: - Push Notifications - APNs Token
    
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        print("[AppDelegate] APNs token received, passing to Firebase")
        
        // Passer le token APNs à Firebase
        Messaging.messaging().apnsToken = deviceToken
        
        // Forcer la récupération du token FCM
        Messaging.messaging().token { token, error in
            if let error = error {
                print("[AppDelegate] ❌ Error fetching FCM token: \(error)")
                return
            }
            
            if let fcmToken = token {
                print("[AppDelegate] ✅ FCM Token received: \(fcmToken.prefix(50))...")
                
                // Envoyer le token FCM à Capacitor via une notification custom
                NotificationCenter.default.post(
                    name: Notification.Name("FCMTokenReceived"),
                    object: nil,
                    userInfo: ["token": fcmToken]
                )
                
                // Aussi poster à Capacitor de manière standard
                if let tokenData = fcmToken.data(using: .utf8) {
                    NotificationCenter.default.post(
                        name: .capacitorDidRegisterForRemoteNotifications,
                        object: tokenData
                    )
                }
            }
        }
    }
    
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[AppDelegate] ❌ Failed to register for remote notifications: \(error)")
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}

// MARK: - Firebase MessagingDelegate
extension AppDelegate: MessagingDelegate {
    
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        print("[AppDelegate] MessagingDelegate - FCM Token: \(fcmToken?.prefix(50) ?? "nil")...")
        
        guard let token = fcmToken else { return }
        
        // Poster le token FCM à Capacitor
        if let tokenData = token.data(using: .utf8) {
            NotificationCenter.default.post(
                name: .capacitorDidRegisterForRemoteNotifications,
                object: tokenData
            )
        }
    }
}

// MARK: - UNUserNotificationCenterDelegate
extension AppDelegate: UNUserNotificationCenterDelegate {
    
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }
    
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        NotificationCenter.default.post(name: Notification.Name("pushNotificationActionPerformed"), object: nil, userInfo: userInfo)
        completionHandler()
    }
}
