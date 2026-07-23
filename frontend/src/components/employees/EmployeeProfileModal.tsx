import { Pencil, Printer, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Employee } from '../../api/modules';
import { statusLabel } from '../../utils/employeeExcel';
import { useAuth } from '../../context/AuthContext';

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium">{value?.trim() || <span className="font-normal text-slate-400">—</span>}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</div>
    </div>
  );
}

export function EmployeeProfileModal({
  employee,
  onClose,
  onEdit,
  onDelete,
}: {
  employee: Employee | null;
  onClose: () => void;
  onEdit: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
}) {
  const { can } = useAuth();

  return (
    <Modal open={Boolean(employee)} onClose={onClose} title={`Employee Profile — ${employee?.name ?? ''}`} size="lg">
      {employee && (
        <div>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold">{employee.name}</p>
              <p className="text-sm text-slate-500">{employee.employeeCode}</p>
            </div>
            <Badge value={employee.status} label={statusLabel(employee.status)} />
          </div>

          <Section title="Personal Details">
            <Field label="Father's Name" value={employee.fatherName} />
            <Field label="Contact Number" value={employee.contactNumber} />
            <Field label="Date of Birth" value={employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString() : null} />
          </Section>

          <Section title="Employment Details">
            <Field label="Project" value={employee.project?.projectName} />
            <Field label="Department" value={employee.department?.name} />
            <Field label="Designation" value={employee.designation?.name} />
            <Field label="Date of Joining" value={employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString() : null} />
            <Field label="Reporting Manager" value={employee.reportingManager?.name} />
          </Section>

          <Section title="Government IDs">
            <Field label="PAN Card Number" value={employee.panNumber} />
            <Field label="Aadhaar Card Number" value={employee.aadhaarNumber} />
            <Field label="Passport Number" value={employee.passportNumber} />
            <Field label="PF Number" value={employee.pfNumber} />
            <Field label="UAN Number" value={employee.uanNumber} />
            <Field label="ESIC Number" value={employee.esicNumber} />
          </Section>

          <Section title="Bank Details">
            <Field label="Bank Account Number" value={employee.bankAccountNumber} />
            <Field label="Bank IFSC Code" value={employee.bankIfscCode} />
            <Field label="Bank Name" value={employee.bankName} />
            <Field label="Bank Account Name" value={employee.bankAccountName} />
          </Section>

          <div className="mb-1">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Address</h3>
            <p className="whitespace-pre-wrap text-sm">{employee.address?.trim() || <span className="text-slate-400">—</span>}</p>
          </div>

          <div className="mt-6 flex justify-end gap-2 print:hidden">
            {can('EMPLOYEES', 'edit') && (
              <button
                className="btn-secondary"
                onClick={() => {
                  onClose();
                  onEdit(employee);
                }}
              >
                <Pencil size={15} /> Edit
              </button>
            )}
            {can('EMPLOYEES', 'delete') && (
              <button
                className="btn-secondary text-red-600"
                onClick={() => {
                  onClose();
                  onDelete(employee);
                }}
              >
                <Trash2 size={15} /> Delete
              </button>
            )}
            <button className="btn-primary" onClick={() => window.print()}>
              <Printer size={15} /> Print Profile
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
