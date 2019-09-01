import User from '../models/User';
import File from '../models/File';

class ProviderController {
  async index(request, response) {
    const providers = await User.findAll({
      where: { provider: true },
      attributes: ['id', 'name', 'email'],
      include: [
        {
          model: File,
          as: 'avatar',
          attributes: ['name', 'path', 'url'],
        },
      ],
    });

    return response.json(providers);
  }
}

export default new ProviderController();
