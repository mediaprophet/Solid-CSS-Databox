import React, { useState } from 'react';
import './index.css';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inspection' | 'quotation'>('dashboard');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', description: 'Labor (Plumbing rough-in)', quantity: 8, unitPrice: 95 },
    { id: '2', description: 'Copper Pipes 1/2"', quantity: 20, unitPrice: 12.50 },
  ]);

  const [inspectionNotes, setInspectionNotes] = useState('');

  const addLineItem = () => {
    setLineItems([...lineItems, { id: Date.now().toString(), description: '', quantity: 1, unitPrice: 0 }]);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(lineItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const calculateSubtotal = () => lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const calculateTax = () => calculateSubtotal() * 0.10; // 10% GST/VAT
  const calculateTotal = () => calculateSubtotal() + calculateTax();

  const handleSave = async () => {
    // In a full implementation, this would use @inrupt/solid-client to write RDF to the Pod
    alert('Saving to Solid Pod...');
  };

  return (
    <div className="container">
      <header className="app-header flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 0 }}>TradeSync Pro</h1>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>Connected to WebID: tradie.pod.example.com</p>
        </div>
        <div className="flex gap-4">
          <button className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
          <button className={`btn ${activeTab === 'inspection' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('inspection')}>Site Inspection</button>
          <button className={`btn ${activeTab === 'quotation' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('quotation')}>Quotation</button>
        </div>
      </header>

      <main className="animate-fade-in">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-2">
            <div className="glass-card">
              <h3>Recent Inspections</h3>
              <p>You have 3 site inspections awaiting quotation.</p>
              <ul style={{ listStyle: 'none', color: 'var(--text-main)' }}>
                <li style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--surface-border)' }}>123 Smith Street - Plumbing Repair</li>
                <li style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--surface-border)' }}>45 Jones Road - Kitchen Reno</li>
                <li style={{ padding: '0.5rem 0' }}>88 Park Ave - Bathroom Leak</li>
              </ul>
            </div>
            <div className="glass-card delay-1">
              <h3>Active Quotes</h3>
              <p>2 quotes pending customer approval.</p>
              <ul style={{ listStyle: 'none', color: 'var(--text-main)' }}>
                <li style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>QT-2024-001</span>
                  <span style={{ color: 'var(--accent-color)' }}>$1,250.00</span>
                </li>
                <li style={{ padding: '0.5rem 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>QT-2024-002</span>
                  <span style={{ color: 'var(--accent-color)' }}>$3,400.00</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'inspection' && (
          <div className="glass-card">
            <h2>Site Inspection Report</h2>
            <p>Capture details from the job site to build your quotation.</p>
            
            <div className="input-group mt-4">
              <label className="input-label">Client Name</label>
              <input type="text" className="input-field" placeholder="John Doe" />
            </div>

            <div className="input-group">
              <label className="input-label">Site Address</label>
              <input type="text" className="input-field" placeholder="123 Example Street" />
            </div>

            <div className="input-group">
              <label className="input-label">Inspection Notes & Measurements</label>
              <textarea 
                className="input-field" 
                placeholder="Observed water damage near the main pipe. Need to replace 2 meters of copper piping and the main valve."
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
              />
            </div>
            
            <div className="input-group">
              <label className="input-label">Photos (Will be saved to Pod)</label>
              <div style={{ padding: '2rem', border: '2px dashed var(--surface-border)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Drag and drop photos here, or click to upload.
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-8">
              <button className="btn btn-outline">Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save Inspection to Pod</button>
            </div>
          </div>
        )}

        {activeTab === 'quotation' && (
          <div className="glass-card">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2>Quotation Builder</h2>
                <p>Generate a professional quote for your client.</p>
              </div>
              <button className="btn btn-outline" onClick={addLineItem}>+ Add Line Item</button>
            </div>

            <table className="line-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ width: '100px' }}>Qty</th>
                  <th style={{ width: '150px' }}>Unit Price</th>
                  <th className="amount-col" style={{ width: '150px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map(item => (
                  <tr key={item.id}>
                    <td>
                      <input 
                        type="text" 
                        className="input-field" 
                        style={{ padding: '0.5rem' }}
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        className="input-field" 
                        style={{ padding: '0.5rem' }}
                        value={item.quantity}
                        onChange={(e) => updateLineItem(item.id, 'quantity', parseFloat(e.target.value))}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        className="input-field" 
                        style={{ padding: '0.5rem' }}
                        value={item.unitPrice}
                        onChange={(e) => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value))}
                      />
                    </td>
                    <td className="amount-col">
                      ${(item.quantity * item.unitPrice).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="totals-section">
              <div className="total-row">
                <span>Subtotal</span>
                <span>${calculateSubtotal().toFixed(2)}</span>
              </div>
              <div className="total-row">
                <span>Tax (10%)</span>
                <span>${calculateTax().toFixed(2)}</span>
              </div>
              <div className="total-row grand-total">
                <span>Total</span>
                <span>${calculateTotal().toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-8">
              <button className="btn btn-outline" onClick={handleSave}>Save Draft</button>
              <button className="btn btn-accent" onClick={handleSave}>Publish & Issue Quote</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
