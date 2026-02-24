package com.profiremanager.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Créer les canaux de notification pour Android 8.0+
        createNotificationChannels();
    }
    
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            
            // Canal par défaut - priorité haute avec son
            NotificationChannel defaultChannel = new NotificationChannel(
                "default_channel",
                "Notifications",
                NotificationManager.IMPORTANCE_HIGH
            );
            defaultChannel.setDescription("Notifications générales de l'application");
            defaultChannel.enableVibration(true);
            defaultChannel.setVibrationPattern(new long[]{0, 500, 200, 500});
            
            // Utiliser le son de notification par défaut
            Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
            defaultChannel.setSound(defaultSoundUri, audioAttributes);
            
            notificationManager.createNotificationChannel(defaultChannel);
            
            // Canal urgent - priorité maximale avec son d'alarme
            NotificationChannel urgentChannel = new NotificationChannel(
                "urgent_channel",
                "Notifications urgentes",
                NotificationManager.IMPORTANCE_HIGH
            );
            urgentChannel.setDescription("Demandes de remplacement et alertes urgentes");
            urgentChannel.enableVibration(true);
            urgentChannel.setVibrationPattern(new long[]{0, 1000, 500, 1000, 500, 1000});
            urgentChannel.setBypassDnd(true); // Passer outre le mode Ne pas déranger
            
            // Utiliser le son d'alarme pour les urgences
            Uri alarmSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmSoundUri == null) {
                alarmSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            urgentChannel.setSound(alarmSoundUri, audioAttributes);
            
            notificationManager.createNotificationChannel(urgentChannel);
        }
    }
}
