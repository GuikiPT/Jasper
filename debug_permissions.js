const { PrismaClient } = require('@prisma/client');

async function debugPermissions() {
    const prisma = new PrismaClient();
    
    try {
        const guildId = '1287557370427474060';
        const memberId = '926914230924509264';
        
        // Check role settings
        const roleSettings = await prisma.guildRoleSettings.findUnique({
            where: { guildId }
        });
        
        if (!roleSettings) {
            console.log('❌ No role settings found for guild');
            return;
        }
        
        console.log('✅ Role settings found:');
        console.log('- allowedTagRoles:', JSON.parse(roleSettings.allowedTagRoles));
        console.log('- allowedStaffRoles:', JSON.parse(roleSettings.allowedStaffRoles));
        console.log('- allowedAdminRoles:', JSON.parse(roleSettings.allowedAdminRoles));
        console.log('- supportRoles:', JSON.parse(roleSettings.supportRoles));
        
        // Check what buckets the tag command uses
        const tagCommandBuckets = ['allowedTagRoles', 'allowedStaffRoles', 'allowedAdminRoles'];
        console.log('\n📋 Tag command checks these buckets:', tagCommandBuckets);
        
        // Simulate the role check logic
        const allowedRoles = new Set();
        
        for (const bucket of tagCommandBuckets) {
            const value = roleSettings[bucket];
            if (value) {
                const roles = JSON.parse(value);
                if (Array.isArray(roles)) {
                    roles.forEach(role => allowedRoles.add(role));
                }
            }
        }
        
        console.log('\n🎭 All allowed roles combined:', Array.from(allowedRoles));
        
        if (allowedRoles.size === 0) {
            console.log('❌ No allowed roles configured - this is why access is denied with "no-config"');
        } else {
            console.log('✅ Allowed roles are configured');
            console.log('🔍 The issue might be:');
            console.log('  1. Your Discord member object doesn\'t have the expected roles');
            console.log('  2. The role IDs in Discord don\'t match the ones in database');
            console.log('  3. There\'s a timing issue with permission checks');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugPermissions();