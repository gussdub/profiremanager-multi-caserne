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
        
        // Configurer Firebase Messaging delegate pour obtenir le token FCM
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
        // Passer le token APNs à Firebase pour qu'il génère le token FCM
        Messaging.messaging().apnsToken = deviceToken
        print("[AppDelegate] APNs token received, passing to Firebase")
    }
    
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[AppDelegate] Failed to register for remote notifications: \(error)")
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}

// MARK: - Firebase MessagingDelegate
extension AppDelegate: MessagingDelegate {
    
    // Cette méthode est appelée quand Firebase génère un nouveau token FCM
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        print("[AppDelegate] FCM Token received: \(fcmToken ?? "nil")")
        
        guard let token = fcmToken else { return }
        
        // Convertir le token en Data pour Capacitor
        if let tokenData = token.data(using: .utf8) {
            // Poster le token FCM à Capacitor (pas le token APNs)
            NotificationCenter.default.post(
                name: .capacitorDidRegisterForRemoteNotifications,
                object: tokenData
            )
        }
    }
}

// MARK: - UNUserNotificationCenterDelegate
extension AppDelegate: UNUserNotificationCenterDelegate {
    
    // Afficher les notifications quand l'app est au premier plan
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Afficher bannière + son + badge même en premier plan
        completionHandler([.banner, .sound, .badge])
    }
    
    // Gérer le clic sur une notification
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        NotificationCenter.default.post(name: Notification.Name("pushNotificationActionPerformed"), object: nil, userInfo: userInfo)
        completionHandler()
    }
}
