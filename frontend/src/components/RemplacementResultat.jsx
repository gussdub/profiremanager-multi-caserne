import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const RemplacementResultat = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const status = searchParams.get("status") || "info";
  const message = searchParams.get("message") || "Action traitée";
  
  const getIcon = () => {
    switch (status) {
      case "succes":
        return "✅";
      case "erreur":
        return "❌";
      default:
        return "ℹ️";
    }
  };
  
  const getColor = () => {
    switch (status) {
      case "succes":
        return "#22c55e";
      case "erreur":
        return "#ef4444";
      default:
        return "#3b82f6";
    }
  };
  
  const getTitle = () => {
    switch (status) {
      case "succes":
        return "Succès !";
      case "erreur":
        return "Erreur";
      default:
        return "Information";
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)",
      padding: "20px"
    }}>
      <Card style={{ maxWidth: "500px", width: "100%", textAlign: "center" }}>
        <CardHeader>
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>
            {getIcon()}
          </div>
          <CardTitle style={{ color: getColor(), fontSize: "24px" }}>
            {getTitle()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p style={{ 
            fontSize: "16px", 
            color: "#333", 
            marginBottom: "24px",
            lineHeight: "1.6"
          }}>
            {decodeURIComponent(message)}
          </p>
          
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <Button 
              onClick={() => navigate("/remplacements")}
              style={{ minWidth: "150px" }}
            >
              📋 Voir les remplacements
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate("/")}
              style={{ minWidth: "150px" }}
            >
              🏠 Accueil
            </Button>
          </div>
          
          <p style={{ 
            fontSize: "12px", 
            color: "#999", 
            marginTop: "24px" 
          }}>
            Vous pouvez fermer cette page ou continuer vers l'application.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RemplacementResultat;
