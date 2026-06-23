import { useEffect, useMemo, useState } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const initialForm = {
  name: '',
  date_of_birth: '',
  phone: '',
  email: '',
  address: '',
  spouse_name: '',
  children_details: '',
  blood_relations: '',
  height: '',
  weight: '',
  policy_number: '',
  policy_provider: '',
  policy_type: '',
  policy_start_date: '',
  policy_end_date: '',
  notes: '',
};

function App() {
  const [dashboard, setDashboard] = useState({ totalCustomers: 0, recentCustomers: [] });
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [photoFile, setPhotoFile] = useState(null);
  const [documentFiles, setDocumentFiles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const selectedSummary = useMemo(() => customers.find((item) => item.id === selectedCustomer?.id), [customers, selectedCustomer]);

  const fetchDashboard = async () => {
    const response = await fetch(`${API_BASE}/dashboard`);
    if (!response.ok) throw new Error('Unable to load dashboard');
    setDashboard(await response.json());
  };

  const fetchCustomers = async (query = '') => {
    const url = new URL(`${API_BASE}/customers`);
    if (query) url.searchParams.set('search', query);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Unable to load customers');
    const data = await response.json();
    setCustomers(data);
    if (selectedCustomer) {
      const found = data.find((item) => item.id === selectedCustomer.id);
      if (!found) setSelectedCustomer(null);
    }
  };

  const fetchCustomerDetails = async (id) => {
    const response = await fetch(`${API_BASE}/customers/${id}`);
    if (!response.ok) throw new Error('Unable to load customer details');
    setSelectedCustomer(await response.json());
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        await Promise.all([fetchDashboard(), fetchCustomers()]);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSearch = async (event) => {
    const query = event.target.value;
    setSearch(query);
    try {
      await fetchCustomers(query);
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setForm(initialForm);
    setPhotoFile(null);
    setDocumentFiles([]);
    setEditingId(null);
  };

  const buildPayload = () => {
    const payload = new FormData();
    payload.append('name', form.name);
    payload.append('date_of_birth', form.date_of_birth || '');
    payload.append('contact_info', JSON.stringify({ phone: form.phone, email: form.email, address: form.address }));
    payload.append('spouse_name', form.spouse_name || '');

    const children = form.children_details
      .split(',')
      .map((child) => child.trim())
      .filter(Boolean);
    payload.append('children_details', JSON.stringify(children));

    const bloodRelations = form.blood_relations
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    payload.append('blood_relations', JSON.stringify(bloodRelations));

    payload.append('height', form.height || '');
    payload.append('weight', form.weight || '');
    payload.append(
      'insurance_policy',
      JSON.stringify({
        policy_number: form.policy_number,
        provider: form.policy_provider,
        policy_type: form.policy_type,
        policy_start_date: form.policy_start_date,
        policy_end_date: form.policy_end_date,
        notes: form.notes,
      }),
    );

    if (photoFile) payload.append('photo', photoFile);
    documentFiles.forEach((file) => payload.append('documents', file));

    return payload;
  };

  const submitCustomer = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      const method = editingId ? 'PUT' : 'POST';
      const endpoint = editingId ? `${API_BASE}/customers/${editingId}` : `${API_BASE}/customers`;
      const response = await fetch(endpoint, {
        method,
        body: buildPayload(),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Save failed');
      }

      resetForm();
      await Promise.all([fetchDashboard(), fetchCustomers(search)]);
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (customer) => {
    setEditingId(customer.id);
    setForm({
      name: customer.name || '',
      date_of_birth: customer.date_of_birth || '',
      phone: customer.contact_info?.phone || '',
      email: customer.contact_info?.email || '',
      address: customer.contact_info?.address || '',
      spouse_name: customer.spouse_name || '',
      children_details: (customer.children_details || []).join(', '),
      blood_relations: (customer.blood_relations || []).join(', '),
      height: customer.height || '',
      weight: customer.weight || '',
      policy_number: customer.insurance_policy?.policy_number || '',
      policy_provider: customer.insurance_policy?.provider || '',
      policy_type: customer.insurance_policy?.policy_type || '',
      policy_start_date: customer.insurance_policy?.policy_start_date || '',
      policy_end_date: customer.insurance_policy?.policy_end_date || '',
      notes: customer.insurance_policy?.notes || '',
    });
    setPhotoFile(null);
    setDocumentFiles([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteCustomer = async (id) => {
    if (!window.confirm('Delete this customer?')) return;
    try {
      const response = await fetch(`${API_BASE}/customers/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      await Promise.all([fetchDashboard(), fetchCustomers(search)]);
      if (selectedCustomer?.id === id) setSelectedCustomer(null);
      if (editingId === id) resetForm();
    } catch (err) {
      setError(err.message);
    }
  };

  const openDetails = async (id) => {
    try {
      await fetchCustomerDetails(id);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteDocument = async (docId) => {
    if (!selectedCustomer) return;
    try {
      const response = await fetch(`${API_BASE}/customers/${selectedCustomer.id}/documents/${docId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to delete document');
      await fetchCustomerDetails(selectedCustomer.id);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>LIC Advisory Customer Database</h1>
        <p>Manage customer profiles, policy data, documents, and photos from one dashboard.</p>
      </header>

      {error && <div className="error">{error}</div>}
      {loading && <div className="info">Loading data...</div>}

      <section className="dashboard-grid">
        <article>
          <h2>Total Customers</h2>
          <strong>{dashboard.totalCustomers}</strong>
        </article>
        <article>
          <h2>Recent Additions</h2>
          <ul>
            {dashboard.recentCustomers.length === 0 && <li>No customers yet.</li>}
            {dashboard.recentCustomers.map((customer) => (
              <li key={customer.id}>{customer.name}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="card">
        <h2>{editingId ? `Edit Customer #${editingId}` : 'Add New Customer'}</h2>
        <form onSubmit={submitCustomer} className="customer-form">
          <div className="grid">
            <label>
              Name *
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Date of Birth
              <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              Email
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="full-width">
              Address
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label>
              Spouse Name
              <input value={form.spouse_name} onChange={(e) => setForm({ ...form, spouse_name: e.target.value })} />
            </label>
            <label>
              Children (comma-separated)
              <input value={form.children_details} onChange={(e) => setForm({ ...form, children_details: e.target.value })} />
            </label>
            <label>
              Blood Relations (comma-separated)
              <input value={form.blood_relations} onChange={(e) => setForm({ ...form, blood_relations: e.target.value })} />
            </label>
            <label>
              Height (cm)
              <input type="number" step="0.01" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} />
            </label>
            <label>
              Weight (kg)
              <input type="number" step="0.01" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </label>
            <label>
              Policy Number
              <input value={form.policy_number} onChange={(e) => setForm({ ...form, policy_number: e.target.value })} />
            </label>
            <label>
              Provider
              <input value={form.policy_provider} onChange={(e) => setForm({ ...form, policy_provider: e.target.value })} />
            </label>
            <label>
              Policy Type
              <input value={form.policy_type} onChange={(e) => setForm({ ...form, policy_type: e.target.value })} />
            </label>
            <label>
              Start Date
              <input type="date" value={form.policy_start_date} onChange={(e) => setForm({ ...form, policy_start_date: e.target.value })} />
            </label>
            <label>
              End Date
              <input type="date" value={form.policy_end_date} onChange={(e) => setForm({ ...form, policy_end_date: e.target.value })} />
            </label>
            <label className="full-width">
              Notes
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </label>
            <label>
              Photo Upload
              <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            </label>
            <label>
              Document Uploads
              <input type="file" multiple accept=".pdf,image/*" onChange={(e) => setDocumentFiles(Array.from(e.target.files || []))} />
            </label>
          </div>
          <div className="actions">
            <button type="submit">{editingId ? 'Update Customer' : 'Create Customer'}</button>
            {editingId && (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="toolbar">
          <h2>Customer Management</h2>
          <input placeholder="Search by name, contact, policy" value={search} onChange={onSearch} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>DOB</th>
                <th>Phone</th>
                <th>Provider</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={5}>No customers found.</td>
                </tr>
              )}
              {customers.map((customer) => (
                <tr key={customer.id} className={selectedSummary?.id === customer.id ? 'selected' : ''}>
                  <td>{customer.name}</td>
                  <td>{customer.date_of_birth || '-'}</td>
                  <td>{customer.contact_info?.phone || '-'}</td>
                  <td>{customer.insurance_policy?.provider || '-'}</td>
                  <td className="row-actions">
                    <button type="button" onClick={() => openDetails(customer.id)}>
                      View
                    </button>
                    <button type="button" onClick={() => startEdit(customer)}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => deleteCustomer(customer.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Customer Details</h2>
        {!selectedCustomer && <p>Select a customer to view full details and documents.</p>}
        {selectedCustomer && (
          <div className="details-grid">
            <div>
              <h3>{selectedCustomer.name}</h3>
              <p>DOB: {selectedCustomer.date_of_birth || '-'}</p>
              <p>Phone: {selectedCustomer.contact_info?.phone || '-'}</p>
              <p>Email: {selectedCustomer.contact_info?.email || '-'}</p>
              <p>Address: {selectedCustomer.contact_info?.address || '-'}</p>
              <p>Spouse: {selectedCustomer.spouse_name || '-'}</p>
              <p>Children: {(selectedCustomer.children_details || []).join(', ') || '-'}</p>
              <p>Blood Relations: {(selectedCustomer.blood_relations || []).join(', ') || '-'}</p>
              <p>Height: {selectedCustomer.height || '-'}</p>
              <p>Weight: {selectedCustomer.weight || '-'}</p>
            </div>
            <div>
              <h4>Policy</h4>
              <p>Number: {selectedCustomer.insurance_policy?.policy_number || '-'}</p>
              <p>Provider: {selectedCustomer.insurance_policy?.provider || '-'}</p>
              <p>Type: {selectedCustomer.insurance_policy?.policy_type || '-'}</p>
              <p>
                Period: {selectedCustomer.insurance_policy?.policy_start_date || '-'} to{' '}
                {selectedCustomer.insurance_policy?.policy_end_date || '-'}
              </p>
              <p>Notes: {selectedCustomer.insurance_policy?.notes || '-'}</p>
              {selectedCustomer.photo_url && <img className="photo" src={selectedCustomer.photo_url} alt={selectedCustomer.name} />}
            </div>
            <div className="full-width">
              <h4>Documents</h4>
              {(!selectedCustomer.documents || selectedCustomer.documents.length === 0) && <p>No documents uploaded.</p>}
              <ul>
                {(selectedCustomer.documents || []).map((doc) => (
                  <li key={doc.id}>
                    <a href={doc.url} target="_blank" rel="noreferrer">
                      {doc.original_name}
                    </a>
                    <button type="button" className="danger" onClick={() => deleteDocument(doc.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
