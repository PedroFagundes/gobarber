import * as Yup from 'yup';
import { startOfHour, parseISO, isBefore, format, subHours } from 'date-fns';
import pt from 'date-fns/locale/pt';

import User from '../models/User';
import File from '../models/File';
import Appointment from '../models/Appointment';
import Notification from '../schemas/Notification';

import CancellationMail from '../jobs/CancellationMail';
import Queue from '../../libs/Queue';

class AppointmentController {
  async index(request, response) {
    const { page = 1 } = request.query;

    const appointments = await Appointment.findAll({
      where: {
        user_id: request.userId,
        canceled_at: null,
      },
      order: ['date'],
      attributes: ['id', 'date', 'past', 'cancelable'],
      limit: 20,
      offset: (page - 1) * 20,
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name'],
          include: [
            { model: File, as: 'avatar', attributes: ['id', 'path', 'url'] },
          ],
        },
      ],
    });

    return response.json({ appointments });
  }

  async store(request, response) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required(),
    });

    if (!schema.isValid(request.body)) {
      return response.status(400).json({ error: "Data didn't validate" });
    }

    const { provider_id, date } = request.body;

    /**
     * Check if provider_id is a provider
     */
    const isProvider = await User.findOne({
      where: { id: provider_id, provider: true },
    });

    if (!isProvider) {
      return response
        .status(401)
        .json({ error: 'The user specified as provider is not a provider' });
    }

    const hourStart = startOfHour(parseISO(date));

    /**
     * Check if user is the same as the provider
     */
    if (request.userId === provider_id) {
      return response
        .status(400)
        .json({ error: "You can't make an appointment to yourself" });
    }

    /**
     * Verifies if the appointment pretended hour isn't in past
     */
    if (isBefore(hourStart, new Date())) {
      return response.status(400).json({ error: 'Past dates are not allowed' });
    }

    /**
     * Verifies if the provider is available
     */
    const hasAppointment = await Appointment.findOne({
      where: { provider_id, canceled_at: null, date: hourStart },
    });

    if (hasAppointment) {
      return response
        .status(400)
        .json({ error: 'Appointment date is not available' });
    }

    const appointment = await Appointment.create({
      user_id: request.userId,
      provider_id,
      date,
    });

    /**
     * Notifies appointment provider
     */
    const user = await User.findByPk(request.userId);
    const formattedDate = format(
      hourStart,
      "'dia' dd 'de' MMMM', às' H:mm'h'",
      { locale: pt }
    );

    await Notification.create({
      content: `Novo agendamento de ${user.name} para ${formattedDate}`,
      user: provider_id,
    });

    return response.json(appointment);
  }

  async delete(request, response) {
    const appointment = await Appointment.findByPk(request.params.id, {
      include: [
        { model: User, as: 'provider', attributes: ['name', 'email'] },
        { model: User, as: 'user', attributes: ['name'] },
      ],
    });

    if (!appointment) {
      return response.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.canceled_at) {
      return response
        .status(400)
        .json({ error: 'This appointment is already canceled' });
    }

    if (appointment.user_id !== request.userId) {
      return response.status(401).json({
        error: "You don't have permission to cancel this appointment",
      });
    }

    const dateMinusTwoHours = subHours(appointment.date, 2);

    if (isBefore(dateMinusTwoHours, new Date())) {
      return response
        .status(401)
        .json({ error: 'You can only cancel appointments 2 hours in advance' });
    }

    appointment.canceled_at = new Date();

    await appointment.save();

    await Queue.add(CancellationMail.key, {
      appointment,
    });

    return response.json(appointment);
  }
}

export default new AppointmentController();
