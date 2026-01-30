import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { apiGet } from '../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';

const EmailsHistory = () => {
  const { user } = useAuth();
  const { tenantSlug } = useTenant();
  
  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filtres
  const [typeFilter, setTypeFilter] = useState('');
  const [statutFilter, setStatutFilter] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [periode, setPeriode] = useState('7d');
  
  // Vue détaillée
  const [selectedEmail, setSelectedEmail] = useState(null);

  const typeLabels = {
    'welcome': 'Bienvenue',
    'password_reset': 'Réinitialisation MDP',
    'temp_password': 'MDP Temporaire',
    'gardes_notification': 'Notification Gardes',
    'super_admin_welcome': 'Bienvenue Super Admin',
    'debogage': 'Notification Débogage'
  };

  const loadEmails = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15'
      });
      
      if (typeFilter) params.append('type_email', typeFilter);
      if (statutFilter) params.append('statut', statutFilter);
      if (searchEmail) params.append('destinataire', searchEmail);
      
      const response = await apiGet(tenantSlug, `/admin/emails-history?${params.toString()}`);
      setEmails(response.emails || []);
      setTotalPages(response.total_pages || 1);
      setTotal(response.total || 0);
    } catch (error) {
      console.error('Erreur chargement historique emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await apiGet(tenantSlug, `/admin/emails-history/stats?periode=${periode}`);
      setStats(response);
    } catch (error) {
      console.error('Erreur chargement stats emails:', error);
    }
  };

  useEffect(() => {
    if (tenantSlug && user?.role === 'admin') {
      loadEmails();
      loadStats();
    }
  }, [tenantSlug, user, page]);

  useEffect(() => {
    if (tenantSlug && user?.role === 'admin') {
      loadStats();
    }
  }, [periode]);

  const handleSearch = () => {
    setPage(1);
    loadEmails();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 text-center text-gray-500">
        Accès réservé aux administrateurs
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="emails-history">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historique des E-mails</h1>
          <p className="text-gray-600">Suivi des communications envoyées par l'application</p>
        </div>
      </div>

      {/* Statistiques */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Total envoyés ({periode})</div>
              <div className="text-2xl font-bold text-gray-900">{stats.total_emails}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Réussis</div>
              <div className="text-2xl font-bold text-green-600">{stats.emails_success}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Échoués</div>
              <div className="text-2xl font-bold text-red-600">{stats.emails_failed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Taux de succès</div>
              <div className="text-2xl font-bold text-blue-600">{stats.taux_succes}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Statistiques par type */}
      {stats?.stats_par_type?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Répartition par type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.stats_par_type.map((item, index) => (
                <Badge key={index} variant="outline" className="text-sm py-1 px-3">
                  {typeLabels[item.type] || item.type}: <span className="font-bold ml-1">{item.count}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rechercher par email</label>
              <Input
                placeholder="email@exemple.com"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="w-[180px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Type d'email</label>
              <Select value={typeFilter || "all"} onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="welcome">Bienvenue</SelectItem>
                  <SelectItem value="password_reset">Réinitialisation MDP</SelectItem>
                  <SelectItem value="temp_password">MDP Temporaire</SelectItem>
                  <SelectItem value="gardes_notification">Notification Gardes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <Select value={statutFilter} onValueChange={setStatutFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous</SelectItem>
                  <SelectItem value="sent">Envoyés</SelectItem>
                  <SelectItem value="failed">Échoués</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Période stats</label>
              <Select value={periode} onValueChange={setPeriode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24 heures</SelectItem>
                  <SelectItem value="7d">7 jours</SelectItem>
                  <SelectItem value="30d">30 jours</SelectItem>
                  <SelectItem value="90d">90 jours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSearch} className="bg-red-600 hover:bg-red-700">
              🔍 Rechercher
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Liste des e-mails */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex justify-between items-center">
            <span>E-mails envoyés ({total} résultats)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Chargement...</div>
          ) : emails.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Aucun e-mail trouvé
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium text-gray-600">Date</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-600">Type</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-600">Destinataire</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-600">Sujet</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-600">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emails.map((email) => (
                      <tr
                        key={email.id}
                        className="border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedEmail(email)}
                      >
                        <td className="py-3 px-2 text-sm">{formatDate(email.created_at)}</td>
                        <td className="py-3 px-2">
                          <Badge variant="outline" className="text-xs">
                            {typeLabels[email.type_email] || email.type_email}
                          </Badge>
                        </td>
                        <td className="py-3 px-2">
                          <div className="text-sm font-medium">{email.destinataire_nom || '-'}</div>
                          <div className="text-xs text-gray-500">{email.destinataire_email}</div>
                        </td>
                        <td className="py-3 px-2 text-sm max-w-[300px] truncate">{email.sujet}</td>
                        <td className="py-3 px-2">
                          {email.statut === 'sent' ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">✓ Envoyé</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 border-red-200">✗ Échec</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-gray-500">
                  Page {page} sur {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    ← Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Suivant →
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal détails e-mail */}
      {selectedEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedEmail(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold">Détails de l'e-mail</h3>
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-500">Date d'envoi</label>
                  <p className="font-medium">{formatDate(selectedEmail.created_at)}</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-500">Type</label>
                  <p>
                    <Badge variant="outline">
                      {typeLabels[selectedEmail.type_email] || selectedEmail.type_email}
                    </Badge>
                  </p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-500">Destinataire</label>
                  <p className="font-medium">{selectedEmail.destinataire_nom || '-'}</p>
                  <p className="text-sm text-gray-600">{selectedEmail.destinataire_email}</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-500">Sujet</label>
                  <p className="font-medium">{selectedEmail.sujet}</p>
                </div>
                
                <div>
                  <label className="text-sm text-gray-500">Statut</label>
                  <p>
                    {selectedEmail.statut === 'sent' ? (
                      <Badge className="bg-green-100 text-green-800">✓ Envoyé avec succès</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800">✗ Échec de l'envoi</Badge>
                    )}
                  </p>
                </div>
                
                {selectedEmail.erreur && (
                  <div>
                    <label className="text-sm text-gray-500">Erreur</label>
                    <p className="text-red-600 text-sm bg-red-50 p-2 rounded">{selectedEmail.erreur}</p>
                  </div>
                )}
                
                {selectedEmail.metadata && Object.keys(selectedEmail.metadata).length > 0 && (
                  <div>
                    <label className="text-sm text-gray-500">Métadonnées</label>
                    <pre className="bg-gray-50 p-2 rounded text-xs overflow-x-auto">
                      {JSON.stringify(selectedEmail.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
              
              <div className="mt-6 flex justify-end">
                <Button variant="outline" onClick={() => setSelectedEmail(null)}>
                  Fermer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailsHistory;
