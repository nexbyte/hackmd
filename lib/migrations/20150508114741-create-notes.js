'use strict'
module.exports = {
  up: function (queryInterface, Sequelize) {
    return queryInterface.createTable('Notes', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4
      },
      ownerId: Sequelize.UUID,
      content: Sequelize.TEXT,
      filePath: Sequelize.TEXT,
      namespace: Sequelize.STRING(100),
      tags: Sequelize.TEXT,
      title: Sequelize.STRING,
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE,
      storedAt: Sequelize.DATE
    })
  },

  down: function (queryInterface, Sequelize) {
    return queryInterface.dropTable('Notes')
  }
}
