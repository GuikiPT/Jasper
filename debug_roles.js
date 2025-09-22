const { PrismaClient } = require('@prisma/client');

async function checkRoles() {
    const prisma = new PrismaClient();
    
    try {
        const guildId = '1287557370427474060';
        
        // Check if guild exists
        const guild = await prisma.guildSettings.findUnique({
            where: { id: guildId },
            include: {
                roles: true
            }
        });
        
        console.log('Guild found:', guild ? 'YES' : 'NO');
        if (guild) {
            console.log('Guild roles config:', guild.roles);
        }
        
        // Check role settings directly
        const roleSettings = await prisma.guildRoleSettings.findUnique({
            where: { guildId }
        });
        
        console.log('Role settings found:', roleSettings ? 'YES' : 'NO');
        if (roleSettings) {
            console.log('Role settings:');
            console.log('- allowedAdminRoles:', roleSettings.allowedAdminRoles);
            console.log('- allowedStaffRoles:', roleSettings.allowedStaffRoles);
            console.log('- allowedTagRoles:', roleSettings.allowedTagRoles);
            console.log('- supportRoles:', roleSettings.supportRoles);
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkRoles();