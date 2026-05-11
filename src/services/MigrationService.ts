
import { DataService } from './DataService';

export class MigrationService {
  static async migrateAllUsers() {
    console.log("[MIGRATION] Starting user migration...");
    try {
      const users = await DataService.list('users');
      console.log(`[MIGRATION] Found ${users.length} users.`);
      
      const updates = users.map(async (data: any) => {
        const id = data.uid || data.id;
        
        // 1. Determine Role
        let role = data.role;
        if (!role && data.cargo) {
          const cargoLower = data.cargo.toLowerCase();
          if (cargoLower.includes('admin')) role = 'admin';
          else if (cargoLower.includes('gestor') || cargoLower.includes('gerente')) role = 'gestor';
          else role = 'atendente';
        }
        role = role || 'atendente';

        // 2. Determine Permissions
        let permissions = data.permissions;
        if (!permissions) {
          if (role === 'admin') {
            permissions = { 
              canReadAllLeads: true, 
              canWriteAllLeads: true, 
              canDelete: true,
              canAccessSettings: true,
              canManageUsers: true
            };
          } else if (role === 'gestor') {
            permissions = { 
              canReadAllLeads: true, 
              canWriteAllLeads: true, 
              canDelete: false,
              canAccessSettings: true,
              canManageUsers: false
            };
          } else {
            permissions = { 
              canReadAllLeads: false, 
              canWriteAllLeads: true, 
              canDelete: false,
              canAccessSettings: false,
              canManageUsers: false
            };
          }
        }

        // 3. Perform Migration
        console.log(`[MIGRATION] Migrating user ${id} to role: ${role}`);
        await DataService.save('user', id, {
          ...data,
          role,
          permissions,
          status: data.status || 'active',
          userType: data.userType || 'HUMAN',
          updatedAt: new Date().toISOString()
        }, 'USUARIO');
      });

      await Promise.all(updates);
      console.log("[MIGRATION] All users migrated successfully.");
    } catch (error) {
      console.error("[MIGRATION] Error during migration:", error);
      throw error;
    }
  }
}
